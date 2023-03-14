// The keys in these objects are unused, just making it easier to update/keep track in the future
const WALLET_COUNTS = {
  Taki: 159_712,
  GaryClub: 24_684,
  Rallyio: 130_000,
  Unite: 7_500,
  Shop: 2_100,
  JoyrideSolitaire: 1_440_157,
};

const TXN_COUNTS = {
  Taki: 8_500_000,
  GaryClub: 14_714,
  Rallyio: 6_250_000,
  Unite: 10_750,
  Shop: 15_100,
  JoyrideSolitaire: 20_449_611,
};

// these numbers should be post-decimals (not on chain units)
const TVL_AMOUNTS = {
  JoyrideSolitaire: 67_303_848,
};

export type OffchainHardcodedData = {
  totalWalletCount: number;
  totalTransactionCount: number;
  tvl: number;
};

export function getOffchainHardcodedData(): OffchainHardcodedData {
  return {
    totalWalletCount: Object.values(WALLET_COUNTS).reduce(
      (accumulator, value) => accumulator + value
    ),
    totalTransactionCount: Object.values(TXN_COUNTS).reduce(
      (accumulator, value) => accumulator + value
    ),
    tvl: Object.values(TVL_AMOUNTS).reduce(
      (accumulator, value) => accumulator + value
    ),
  };
}
