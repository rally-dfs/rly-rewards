import { clusterApiUrl, Connection } from "@solana/web3.js";

import {
  latestAccountInputsOnDateSolanaFm,
  tokenAccountsInfoBetweenDatesSolanaFm,
} from "./solana_fm";
import {
  allTransfersBetweenDatesBitquery,
  tokenAccountsInfoBetweenDatesBitquery,
} from "./bitquery";

const SOL_NETWORK = "mainnet-beta";
const endpoint = clusterApiUrl(SOL_NETWORK);
const connection = new Connection(endpoint, "finalized");

export async function tokenAccountBalanceOnDate(
  tokenAccountAddress: string,
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  endDateExclusive: Date,
  previousBalance: number,
  previousEndDateExclusive: Date,
  tokenMintDecimals: number
) {
  // call sfm, then use that date range to call bitquery
  const latestAccountInputSFM = await latestAccountInputsOnDateSolanaFm(
    tokenAccountAddress,
    tokenMintAddress,
    endDateExclusive,
    previousEndDateExclusive
  );

  // just load the BQ transfers after the last found SFM account-input
  const startDateInclusive = latestAccountInputSFM
    ? new Date(latestAccountInputSFM.timestamp)
    : previousEndDateExclusive;

  // this will only be non empty if there was some missing txn in SFM, checking just in case
  const transfersBQ = (
    await allTransfersBetweenDatesBitquery(
      tokenAccountAddress,
      tokenAccountOwnerAddress,
      tokenMintAddress,
      startDateInclusive,
      endDateExclusive
    )
  ).filter(
    (transfer) =>
      transfer.transaction.signature != latestAccountInputSFM?.transactionHash
  );

  if (transfersBQ[0]) {
    // should probably log this and manually investigate this, bitquery txns are unordered and don't include
    // a timestamp so we have to settle for just picking the first one
    console.log(
      "Found txn in BQ not found in SFM, should double check this day's data manually",
      transfersBQ
    );
  }

  const latestTxnHash = transfersBQ[0]
    ? transfersBQ[0].transaction.signature
    : latestAccountInputSFM?.transactionHash;

  if (latestTxnHash === undefined) {
    return previousBalance;
  }

  let txnInfo = await connection.getTransaction(latestTxnHash, {
    commitment: "confirmed",
  });

  const balances = txnInfo?.meta?.postTokenBalances?.filter(
    (tokenInfo) =>
      tokenInfo.owner === tokenAccountOwnerAddress &&
      tokenInfo.mint === tokenMintAddress
  );

  if (!balances) {
    // should log an error and investigate manually
    console.log(
      "Couldn't find on chain balance, falling back to solana.fm value",
      latestTxnHash
    );
    // solana.fm postBalance has no decimals so just multiply by 10^tokenMintDecimals to normalize
    return latestAccountInputSFM?.postBalance
      ? latestAccountInputSFM?.postBalance * 10 ** tokenMintDecimals
      : undefined;
  }

  if (balances.length > 1) {
    console.log("Found more than 1 token account for txn", latestTxnHash);
  }

  return parseInt(balances[0]!.uiTokenAmount.amount);
}

export type TokenBalanceDate = {
  dateExclusive: Date;
  balance: number;
};

const TIMEOUT_BETWEEN_CALLS = 10000;

// Calls tokenAccountBalanceOnDate for all balances between startDate and endDate.
// Like tokenAccountBalanceOnDate, endDate is exclusive (any transactions exactly on endDateExclusive will
// not be counted and will be included in the next day instead)
// Currently just returns an array of TokenBalanceDate but this probably will eventually be called to backfill
// all the dates for a token in the DB or something.
export async function getDailyTokenBalancesBetweenDates(
  tokenAccountAddress: string,
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  earliestEndDateExclusive: Date,
  latestEndDateExclusive: Date,
  tokenMintDecimals: number
) {
  let allBalances: Array<TokenBalanceDate> = [];

  // 0 + a date assumes the all activity happened after that date
  let previousBalance = 0;
  // Dec 2021 was when sRLY was minted, probably an okay default
  let previousEndDateExclusive = new Date("2021-12-19T00:00:00Z");

  let currentEndDateExclusive = new Date(earliestEndDateExclusive);

  while (currentEndDateExclusive <= latestEndDateExclusive) {
    console.log(
      "fetching date",
      currentEndDateExclusive,
      "prev date bal",
      previousEndDateExclusive,
      previousBalance
    );

    try {
      let balance = await tokenAccountBalanceOnDate(
        tokenAccountAddress,
        tokenAccountOwnerAddress,
        tokenMintAddress,
        currentEndDateExclusive,
        previousBalance,
        previousEndDateExclusive,
        tokenMintDecimals
      );

      console.log(currentEndDateExclusive, "balance = ", balance);

      if (balance === undefined || balance === null) {
        throw new Error();
      }

      allBalances.push({
        dateExclusive: currentEndDateExclusive,
        balance: balance,
      });

      previousEndDateExclusive = new Date(currentEndDateExclusive);
      previousBalance = balance;
    } catch (error) {
      console.log("Error fetching balance", error);
      allBalances.push({ dateExclusive: currentEndDateExclusive, balance: -1 });

      // leave previousDate/previousBalance the same, can try again from there the next loop
    }

    // since endDate is exclusive and startDate is inclusive (in the call to _transferAmountsWithFilter inside
    // tokenAccountBalanceOnDateBitquery), we can just +1 day here safely without double counting anything
    currentEndDateExclusive = new Date(
      currentEndDateExclusive.valueOf() + 86400000 // this doesn't work if we need a DST timezone like PST/PDT
    );

    // rate limiting in case we make too many calls
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }

  console.log("balances", allBalances);

  return allBalances;
}

export type TokenAccountInfo = {
  tokenAccountAddress: string;
  ownerAccountAddress?: string;
  // see note in TokenAccountBalance.approximate_minimum_balance on this
  approximateMinimumBalance?: number;
  incomingTransactions: Set<string>;
  outgoingTransactions: Set<string>;
};

/** Calls both bitquery and solana.fm versions of getAllTokenAccountInfo for tokenMintAddress from
 * start date (inclusive) to end date (exclusive). Returns the transactions from bitquery and the balance at
 * endDate from solana.fm
 *
 * @param tokenMintAddress
 * @param startDateInclusive
 * @param endDateExclusive
 */
export async function getAllTokenAccountInfoAndTransactions(
  tokenMintAddress: string,
  tokenMintDecimals: number,
  startDateInclusive: Date,
  endDateExclusive: Date
): Promise<TokenAccountInfo[]> {
  // solana.fm token accounts info
  let tokenAccountsInfoSFMMap = await tokenAccountsInfoBetweenDatesSolanaFm(
    tokenMintAddress,
    startDateInclusive,
    endDateExclusive
  );

  if (tokenAccountsInfoSFMMap === undefined) {
    console.log("Error retrieving solana.fm token account info");
  }

  // bitquery token accounts info
  // note this returns delta(balance) from startDate instead of actual balance (not used for now)
  let tokenAccountsInfoBQMap = await tokenAccountsInfoBetweenDatesBitquery(
    tokenMintAddress,
    startDateInclusive,
    endDateExclusive
  );

  // marry together the two and return a combined list
  // note, after some manual testing, there's a lot of buggy data on solana.fm for the /account-inputs/tokens/{token}
  // call. sometimes txns are missing entirely (even if it shows up in /account-inputs/{account} and sometimes the
  // postBalance is completely wrong so its incoming/outgoing is miscategorized
  // so SFM is probably useful just for the `balance` field and can defer 100% to bitquery for outgoing/incoming txns
  // (in theory we could use SFM to sanity check that bitquery has correct transactions where the value is >= 1, but
  // because they have scraping errors sometimes that completely miscategorize them it doesn't seem work the effort)
  return Object.values(tokenAccountsInfoBQMap).map((bqAccountInfo) => {
    const sfmAccountInfo = tokenAccountsInfoSFMMap
      ? tokenAccountsInfoSFMMap[bqAccountInfo.tokenAccountAddress]
      : undefined;

    // defer to solana.fm balance but since it's often missing, we can use bitquery balanceChange info too
    // if it's positive (if it's negative, too hard to try and tie together from previous days, just don't save
    // the row)
    const bitqueryMinimumBalance =
      bqAccountInfo.balanceChange > 0
        ? bqAccountInfo.balanceChange * 10 ** tokenMintDecimals
        : undefined;
    const approximateMinimumBalance = sfmAccountInfo?.balance
      ? sfmAccountInfo?.balance * 10 ** tokenMintDecimals
      : bitqueryMinimumBalance;

    return {
      tokenAccountAddress: bqAccountInfo.tokenAccountAddress,
      ownerAccountAddress: bqAccountInfo.ownerAccountAddress,
      approximateMinimumBalance: approximateMinimumBalance
        ? // make sure to round this to an int, sometimes the APIs return weird values more than 9 decimals
          Math.round(approximateMinimumBalance)
        : undefined,
      incomingTransactions: bqAccountInfo.incomingTransactions,
      outgoingTransactions: bqAccountInfo.outgoingTransactions,
    };
  });
}
