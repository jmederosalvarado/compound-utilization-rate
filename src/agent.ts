import BigNumber from "bignumber.js";
import { ethers } from "ethers";
import {
  Finding,
  BlockEvent,
  getJsonRpcUrl,
  FindingSeverity,
  FindingType,
} from "forta-agent";
import {
  COMPTROLLER_ABI,
  COMPTROLLER_ADDR,
  CTOKEN_ABI,
  TimeRangeStore,
} from "./utils";

const getUtilizationRate = async (
  ctoken: ethers.Contract
): Promise<BigNumber> => {
  const cashString = (await ctoken.getCash()).toString();
  const cash = new BigNumber(cashString);
  const borrowsString = (await ctoken.totalBorrowsCurrent()).toString();
  const borrows = new BigNumber(borrowsString);
  return borrows.div(cash);
};

const provideHandleBlock = () => {
  const utilizationRates: {
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
      const currRate = await getUtilizationRate(ctoken);
      const prevRate = utilizationRates[ctoken.address].update(
        blockEvent.block.timestamp,
        currRate
      );
      if (currRate.minus(prevRate).div(prevRate).gte(new BigNumber(0.1)))
        findings.push(
          Finding.fromObject({
            name: "cToken Exchange Rate went down",
            description: `cToken ${name} Utilization Rate went down by more than 10%.`,
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
