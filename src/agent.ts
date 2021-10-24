import BigNumber from "bignumber.js";
import { ethers } from "ethers";
import {
  Finding,
  BlockEvent,
  getJsonRpcUrl,
  FindingSeverity,
  FindingType,
} from "forta-agent";
import { TimeRangeStore } from "./store";
import {
  CHANGE_FRAC,
  COMPTROLLER_ABI,
  COMPTROLLER_ADDR,
  CTOKEN_ABI,
} from "./utils";

const getUtilizationRate = async (
  ctoken: ethers.Contract,
  blockNumber: number
): Promise<BigNumber> => {
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
  return borrows.div(cash);
};

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

export default {
  handleBlock: provideHandleBlock(),
};
