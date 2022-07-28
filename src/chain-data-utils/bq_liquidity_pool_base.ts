import { LiquidityCollateralTokenChain } from "../knex-types/liquidity_collateral_token";
import { ethTokenAccountBalanceOnDate } from "./bq_liquidity_pool_eth";
import { solanaTokenAccountBalanceOnDate } from "./bq_liquidity_pool_sol";
import { BITQUERY_TIMEOUT_BETWEEN_CALLS } from "./constants";

/** Just a readability helper function for triaging by chain */
function _tokenAccountBalanceOnDate(
  tokenAccountAddress: string,
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  chain: LiquidityCollateralTokenChain,
  currentEndDateExclusive: Date,
  previousBalance: string
) {
  if (chain === "solana") {
    return solanaTokenAccountBalanceOnDate(
      tokenAccountOwnerAddress, // bq requires owner address for solana, not the actual address
      tokenMintAddress,
      currentEndDateExclusive,
      previousBalance
    );
  } else if (chain === "ethereum") {
    return ethTokenAccountBalanceOnDate(
      tokenAccountAddress, // bq requires actual address for eth (obviously)
      tokenMintAddress,
      currentEndDateExclusive,
      previousBalance
    );
  } else {
    throw new Error(`Invalid chain ${chain}`);
  }
}

export type TokenBalanceDate = {
  dateExclusive: Date;
  balance: string;
};

// Calls tokenAccountBalanceOnDate for all balances between startDate and endDate.
// Like tokenAccountBalanceOnDate, endDate is exclusive (any transactions exactly on endDateExclusive will
// not be counted and will be included in the next day instead)
// Currently just returns an array of TokenBalanceDate but this probably will eventually be called to backfill
// all the dates for a token in the DB or something.
export async function getDailyTokenBalancesBetweenDates(
  tokenAccountAddress: string,
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  chain: LiquidityCollateralTokenChain,
  earliestEndDateExclusive: Date,
  latestEndDateExclusive: Date
) {
  let allBalances: Array<TokenBalanceDate> = [];

  // 0 + a date assumes the all activity happened after that date
  let previousBalance = "0";

  let currentEndDateExclusive = new Date(earliestEndDateExclusive);

  while (currentEndDateExclusive <= latestEndDateExclusive) {
    console.log(
      "fetching date",
      currentEndDateExclusive,
      "prev date bal",
      previousBalance
    );

    try {
      let balance = await _tokenAccountBalanceOnDate(
        tokenAccountAddress,
        tokenAccountOwnerAddress,
        tokenMintAddress,
        chain,
        currentEndDateExclusive,
        previousBalance
      );

      if (balance === undefined || balance === null) {
        throw new Error();
      }

      allBalances.push({
        dateExclusive: currentEndDateExclusive,
        balance: balance,
      });

      previousBalance = balance;
    } catch (error) {
      console.error(
        "Error fetching balance",
        tokenAccountOwnerAddress,
        currentEndDateExclusive,
        error
      );

      // just don't add anything to allBalances, it's ok if there's a gap in dates
      // also leave previousDate/previousBalance the same, can try again from the existing previousDate on the next loop
    }

    // since endDate is exclusive and startDate is inclusive (in the call to _transferAmountsWithFilter inside
    // tokenAccountBalanceOnDateBitquery), we can just +1 day here safely without double counting anything
    currentEndDateExclusive = new Date(
      currentEndDateExclusive.valueOf() + 86400000 // this doesn't work if we need a DST timezone like PST/PDT
    );

    // rate limiting in case we make too many calls
    await new Promise((f) => setTimeout(f, BITQUERY_TIMEOUT_BETWEEN_CALLS()));
  }

  console.log("balances", allBalances);

  return allBalances;
}
