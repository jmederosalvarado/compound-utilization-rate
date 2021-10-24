import BigNumber from "bignumber.js";

export const COMPTROLLER_ADDR = "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b";
export const COMPTROLLER_ABI = [
  "function getAllMarkets() public view returns (address[])",
];
export const CTOKEN_ABI = [
  "function name() public view returns (string)",
  "function getCash() public view returns (uint)",
  "function totalBorrowsCurrent() public view returns (uint)",
];

export class TimeRangeStore {
  store: { [timestamp: number]: BigNumber } = {};

  update(timestamp: number, rate: BigNumber): BigNumber {
    let max = new BigNumber(0);
    for (const timestampKey in this.store) {
      const timestampStored = parseInt(timestampKey);
      if (timestamp - timestampStored >= 60 * 60) {
        delete this.store[timestampKey];
      } else if (this.store[timestampKey].gt(max)) {
        max = this.store[timestampKey];
      }
    }
    this.store[timestamp] = rate;
    return max;
  }
}
