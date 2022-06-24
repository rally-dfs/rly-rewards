// The keys in these objects are unused, just making it easier to update/keep track in the future
const WALLET_COUNTS = {
  Taki: 105_000,
  Rallyio: 130_000,
  Unite: 7_500,
  Shop: 2_100,
};

const TXN_COUNTS = {
  Taki: 8_500_000,
  Rallyio: 6_250_000,
  Unite: 10_750,
  Shop: 15_100,
};

export type OffchainHardcodedData = {
  totalWalletCount: number;
  totalTransactionCount: number;
};

export function getOffchainHardcodedData(): OffchainHardcodedData {
  return {
    totalWalletCount: Object.values(WALLET_COUNTS).reduce(
      (accumulator, value) => accumulator + value
    ),
    totalTransactionCount: Object.values(TXN_COUNTS).reduce(
      (accumulator, value) => accumulator + value
    ),
  };
}
