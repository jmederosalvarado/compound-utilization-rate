import BigNumber from "bignumber.js";

export const CHANGE_FRAC = new BigNumber(0.1);
export const TIME_WINDOW = 60 * 60;

export const COMPTROLLER_ADDR = "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b";
export const COMPTROLLER_ABI = [
  "function getAllMarkets() public view returns (address[])",
];
export const CTOKEN_ABI = [
  "function name() public view returns (string)",
  "function getCash() public view returns (uint)",
  "function totalBorrowsCurrent() public view returns (uint)",
];
