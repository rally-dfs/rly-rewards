import { clusterApiUrl, Connection } from "@solana/web3.js";

import { latestAccountInputsOnDateSolanaFm } from "./solanaFm";
import { allTransfersBetweenDatesBitquery } from "./bitquery";
import exp from "constants";

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

  return parseInt(balances[0].uiTokenAmount.amount);
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
