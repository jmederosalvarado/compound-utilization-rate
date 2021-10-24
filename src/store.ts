import BigNumber from "bignumber.js";
import { TIME_WINDOW } from "./utils";

export class TimeRangeStore {
  store: { [timestamp: number]: BigNumber } = {};

  constructor(timestamp: number, rate: BigNumber) {
    this.update(timestamp, rate);
  }

  update(timestamp: number, rate: BigNumber): [BigNumber, BigNumber] {
    let min = new BigNumber(-1);
    let max = new BigNumber(-1);
    for (const timestampKey in this.store) {
      const timestampStored = parseInt(timestampKey);

      if (timestamp - timestampStored >= TIME_WINDOW) {
        delete this.store[timestampKey];
        continue;
      }

      if (min.isNegative() || this.store[timestampKey].lt(min)) {
        min = this.store[timestampKey];
      }

      if (max.isNegative() || this.store[timestampKey].gt(max)) {
        max = this.store[timestampKey];
      }
    }

    this.store[timestamp] = rate;
    return [min, max];
  }
}
