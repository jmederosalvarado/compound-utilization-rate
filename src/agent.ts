import BigNumber from "bignumber.js";
import { ethers } from "ethers";
import {
  Finding,
  BlockEvent,
  getJsonRpcUrl,
  FindingSeverity,
  FindingType,
  HandleBlock,
} from "forta-agent";
import LRUCache from "lru-cache";
import { TimeRangeStore } from "./store";
import {
  CHANGE_FRAC,
  COMPTROLLER_ABI,
  COMPTROLLER_ADDR,
  CTOKEN_ABI,
  TIME_WINDOW,
} from "./utils";

const utilizationRateCache = new LRUCache<string, BigNumber>();
const getUtilizationRate = async (
  ctoken: ethers.Contract,
  blockNumber: number
): Promise<BigNumber> => {
  const cacheKey = `${ctoken.address}-${blockNumber}`;
  const cached = utilizationRateCache.get(cacheKey);
  if (cached) return cached;

  const cashString = (
    await ctoken.getCash({
      blockTag: blockNumber,
    })
  ).toString();
  const cash = new BigNumber(cashString);
  const borrowsString = (
    await ctoken.totalBorrowsCurrent({ blockTag: blockNumber })
  ).toString();
  const borrows = new BigNumber(borrowsString);
  const utilizationRate = borrows.div(cash);

  utilizationRateCache.set(cacheKey, utilizationRate);
  return utilizationRate;
};

// this method assumes that handleBlock is run sequentially on blocks, it's not documented wether or not this is the way that agents are run. According to https://github.dev/forta-protocol/forta-agent-sdk/blob/eec16a9b1b1be697dbf124e11b3602fca839a6e0/cli/commands/run/run.live.ts#L17-L34, they are run asyncroniously on blocks. See the next method for an alternative stateless implementation.
const provideHandleBlock = () => {
  const ctokenStores: {
    [addr: string]: TimeRangeStore;
  } = {};

  const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());
  const comptroller = new ethers.Contract(
    COMPTROLLER_ADDR,
    COMPTROLLER_ABI,
    provider
  );

  return async (blockEvent: BlockEvent) => {
    const findings: Finding[] = [];

    const ctokenAddrs: string[] = await comptroller.getAllMarkets({
      blockTag: blockEvent.blockNumber,
    });
    const ctokens = ctokenAddrs.map(
      (addr) => new ethers.Contract(addr, CTOKEN_ABI, provider)
    );
    for (const ctoken of ctokens) {
      const name: string = await ctoken.name({
        blockTag: blockEvent.blockNumber,
      });

      const currRate = await getUtilizationRate(ctoken, blockEvent.blockNumber);

      if (!ctokenStores[ctoken.address]) {
        ctokenStores[ctoken.address] = new TimeRangeStore(
          blockEvent.block.timestamp,
          currRate
        );
        continue;
      }

      const [prevRateMin, prevRateMax] = ctokenStores[ctoken.address].update(
        blockEvent.block.timestamp,
        currRate
      );
      const rateDec = currRate.minus(prevRateMax).abs().div(prevRateMax);
      const rateInc = currRate.minus(prevRateMin).abs().div(prevRateMin);
      const rateChange = BigNumber.max(rateDec, rateInc);
      if (rateChange.gte(CHANGE_FRAC))
        findings.push(
          Finding.fromObject({
            name: "cToken Utilization Rate changed",
            description: `cToken ${name} Utilization Rate changed by more than 10%.`,
            alertId: "COMPOUND_CTOKEN_UTILIZATION_RATE",
            severity: FindingSeverity.Info,
            type: FindingType.Info,
          })
        );
    }
    return findings;
  };
};

// stateless version
const handleBlock: HandleBlock = async (blockEvent) => {
  const findings: Finding[] = [];

  const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());
  const comptroller = new ethers.Contract(
    COMPTROLLER_ADDR,
    COMPTROLLER_ABI,
    provider
  );
  const ctokenAddrs: string[] = await comptroller.getAllMarkets({
    blockTag: blockEvent.blockNumber,
  });
  const ctokens = ctokenAddrs.map(
    (addr) => new ethers.Contract(addr, CTOKEN_ABI, provider)
  );
  for (const ctoken of ctokens) {
    const name: string = await ctoken.name({
      blockTag: blockEvent.blockNumber,
    });

    const currRate = await getUtilizationRate(ctoken, blockEvent.blockNumber);

    let block = await provider.getBlock(blockEvent.blockNumber - 1);
    while (blockEvent.block.timestamp - block.timestamp <= TIME_WINDOW) {
      const prevRate = await getUtilizationRate(ctoken, block.number);
      if (currRate.minus(prevRate).abs().div(prevRate).gte(CHANGE_FRAC)) {
        findings.push(
          Finding.fromObject({
            name: "cToken Utilization Rate changed",
            description: `cToken ${name} Utilization Rate changed by more than 10%.`,
            alertId: "COMPOUND_CTOKEN_UTILIZATION_RATE",
            severity: FindingSeverity.Info,
            type: FindingType.Info,
          })
        );
        break;
      }

      if (block.number == 0) break;
      block = await provider.getBlock(block.number - 1);
    }
  }

  return findings;
};

export default {
  handleBlock,
};
