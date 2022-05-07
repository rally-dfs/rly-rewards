import { getTransactionSuccessForHashesBitquery } from "./bitquery";

type SolanaFMAccountInput = {
  transactionHash: string;
  account: string;
  tokenId: string;
  preBalance: number;
  postBalance: number;
  timestamp: string;
};

// exponential backoff starts at 10 minutes and increases by 10x every iteration
const START_TIME_DELTA = 60 * 1000;
const EXPONENTIAL_FACTOR = 10;

// wait 10 seconds between API calls
// sfm is super aggressive with rate limits, seems once you go over they just freeze the account forever (can't figure
// out how to unfreeze, just had to make a new one). probably not intentional but good to be very conservative here.
const TIMEOUT_BETWEEN_CALLS = 10000;

// note endDate can be either exclusive or inclusive, depending on which `url` is being called. it's up to the caller
// to convert endDate into the proper inclusivity before calling this function
// this is almost certainly a bug in solana.fm, so it may change unannounced in the future (see notes below)
async function _fetchAllResultsWithUrlAndDates<T>(
  url: URL,
  startDateInclusive: Date,
  endDateInclusiveOrExclusive: Date
) {
  const pageLimit = 100;

  const requestHeaders = new Headers([
    ["Content-Type", "application/json"],
    ["apikey", process.env.SOLANA_FM_API_KEY || ""],
  ]);

  const params = new URLSearchParams([["limit", pageLimit.toString()]]);

  console.log("start", startDateInclusive, "end", endDateInclusiveOrExclusive);
  params.set("from", startDateInclusive.toISOString());
  params.set("to", endDateInclusiveOrExclusive.toISOString());
  url.search = params.toString();

  let response = await fetch(url.toString(), { headers: requestHeaders });

  let results;
  let responseText;
  try {
    responseText = await response.text();
    results = JSON.parse(responseText);
  } catch (error) {
    console.log("JSON error", responseText, error);
    return undefined;
  }

  let allResults: Array<T> = [];
  allResults = allResults.concat(results);

  // results are in random order so even for token balance (where we only care about the most recent account-input), we
  // still need to get every single page and then find the most recent account-input.
  let page = 2;
  let maxPages = 1000000; // infinite loop protection
  while (results.length == pageLimit && page < maxPages) {
    console.log("fetching page", page);

    params.set("page", page.toString());
    url.search = params.toString();

    response = await fetch(url.toString(), { headers: requestHeaders });

    try {
      responseText = await response.text();
      results = JSON.parse(responseText);
    } catch (error) {
      console.log("JSON error", responseText, error);
      return undefined;
    }

    // console.log(url.toString(), ", response", response, results);

    allResults = allResults.concat(results);

    page += 1;

    // rate limiting here in case we make too many calls
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }

  return allResults;
}

// Queries solana.fm for the last account-inputs of `tokenAccountAddress` (which must belong to `tokenMintAddress`)
// with an end date of `endDateExclusive` (any transactions exactly on endDateExclusive will not be counted)
// Uses exponentially larger time windows until we find the most recent transaction
// If previousDate is cached (e.g. from a previous call) and passed in, then we stop there and
// return null if nothing is found (can also use it to pass in a min startDate to limit the search)
// https://docs.solana.fm/docs/apis/account-input#retrieve-account-inputs-by-a-specific-account
export async function latestAccountInputsOnDateSolanaFm(
  tokenAccountAddress: string,
  tokenMintAddress: string,
  endDateExclusive: Date,
  // since this is cached from a previous `endDateExclusive`, it's also an exclusive bound
  previousEndDateExclusive: Date
) {
  const url = new URL(
    `https://api-alpha.solana.fm/api/v1/account-inputs/${tokenAccountAddress}`
  );

  let delta = START_TIME_DELTA;
  let startDateInclusive = new Date(endDateExclusive.getTime() - delta);

  // this won't ever infinite loop, eventually we'll pass previousDate and return
  while (true) {
    // console.log(url.toString(), ", response", response, results);

    // note: solana.fm has some weird inconsistencies. /account-inputs/tokens/{mintAddress} (used elsewhere) treats end
    // date as exclusive, but /account-inputs/{tokenAccountAddress} (used here) treats end date as inclusive.
    // it's probably a bug, so if end date suddenly starts being treated as exclusive instead in the future (and starts
    // leaving off the last transaction) in the future, we may need to just tweak end date to be exclusive here
    // (i.e. don't subtract 1ms before passing endDateExclusive into fetch)
    // FWIW, solana.fm said end date should be exclusive, so the call here is probably the bug
    const endDateInclusive = new Date(endDateExclusive.valueOf() - 1);

    let results = await _fetchAllResultsWithUrlAndDates<SolanaFMAccountInput>(
      url,
      startDateInclusive,
      endDateInclusive
    );

    if (results === undefined) {
      // TODO: handle error here
      return undefined;
    }

    // found some results, get the most recent one
    if (results.length > 0) {
      // now look through allResults and pick out the most recent result
      let max = results.reduce((previous, current) => {
        // returns both the token inputs and tokenId == '' for lamports, so need to ignore the latter
        if (current.tokenId !== tokenMintAddress) {
          return previous;
        }
        return new Date(previous.timestamp) > new Date(current.timestamp)
          ? previous
          : current;
      });

      // console.log("Max from solana.fm", max);

      // TODO: could probably put in a sanity check alert here, in theory they should all be the same balance
      let sameTimeAsMax = results.filter((value) => {
        return (
          value.timestamp == max.timestamp &&
          value.postBalance != max.postBalance
        );
      });

      // console.log("All results with same timestamp as max", sameTimeAsMax);

      // TODO: this is in display units, not base units :(, maybe can keep using this as a sanity check though
      return max;
    }

    // didn't find any results between previousDate and date so just return previousBalance
    // (make sure we use < and not <= here, since startDate is inclusive and previousDate is exclusive. i.e. if there
    // was a txn exactly on previousEndDateExclusive, we want to make sure we still tried to fetch it)
    if (startDateInclusive < previousEndDateExclusive) {
      return undefined;
    }

    // didn't find any results but there's still more time to check, so loop again
    delta *= EXPONENTIAL_FACTOR;
    startDateInclusive = new Date(endDateExclusive.getTime() - delta);

    // rate limiting here in case we make too many calls
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }
}

export type SolanaFMTokenAccountInfo = {
  tokenAccountAddress: string;
  balance: number;
  incomingTransactions: Set<string>;
  outgoingTransactions: Set<string>;
  // subOneTransactions should be used in conjunction with bitquery results (which have full precision) to tell
  // whether it's incoming, outgoing, or zero (and should be discarded)
  subOneTransactions: Set<string>;
};

// Queries solana.fm account-inputs for all token accounts belonging to `tokenMintAddress` with any activity between
// `startDateInclusive` and `endDateExclusive`
// Returns a map of {tokenAccountAddress => SolanaFMTokenAccountInfo} (i.e. this would probably be used to see which new
// accounts were created that day and for updating balance/txn count for any previous accounts against some running
// db list)
// https://docs.solana.fm/docs/apis/account-input#retrieve-account-inputs-by-a-specific-token
//
// Any transactions exactly on startDateInclusive will be included and any exactly on endDateExclusive will not be
// included. This lets us pass in dates with T00:00:00 for both dates without double counting anything
//
// We're doing some extra filtering of the raw results to better match bitquery's results (which is pretty much what
// we desire). i.e. bitquery automatically excludes failed transactions, automatically excludes CloseAccount
// instructions, and automatically excludes net-zero transfers (handled with `subOneTransactions`).
//
// It's the caller's responsibility to cross reference `subOneTransactions` with the results of bitquery
// (tokenAccountsInfoBetweenDatesBitquery) to determine how to categorize or discard them.
export async function tokenAccountsInfoBetweenDatesSolanaFm(
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date
) {
  // note: solana.fm has some weird inconsistencies. /account-inputs/tokens/{mintAddress} (used here) treats end date
  // as exclusive, but /account-inputs/{tokenAccountAddress} (used elsewhere) treats end date as inclusive.
  // it's probably a bug, so if end date suddenly starts being treated as inclusive instead in the future (and starts
  // double counting txns) in the future, we may need to just tweak end date to be inclusive (i.e. subtract 1ms before
  // passing endDateExclusive into fetch)
  // FWIW, solana.fm said end date should be exclusive, so the call elsewhere is probably the bug
  const url = new URL(
    `https://api-alpha.solana.fm/api/v1/account-inputs/tokens/${tokenMintAddress}`
  );

  let results = await _fetchAllResultsWithUrlAndDates<SolanaFMAccountInput>(
    url,
    startDateInclusive,
    endDateExclusive
  );

  if (results === undefined) {
    // TODO: handle error here
    return undefined;
  }

  let accountInfoMap: { [key: string]: SolanaFMTokenAccountInfo } = {};

  // sort by date so that we can safely update `balance` to the latest one every time
  results
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    .forEach((result) => {
      if (result.tokenId !== tokenMintAddress) {
        // TODO: this shouldn't ever happen, should log an error or something
        console.log("mismatched token id", result.tokenId, tokenMintAddress);
        return;
      }

      if (accountInfoMap[result.account] === undefined) {
        accountInfoMap[result.account] = {
          tokenAccountAddress: result.account,
          balance: 0,
          incomingTransactions: new Set<string>(),
          outgoingTransactions: new Set<string>(),
          subOneTransactions: new Set<string>(),
        };
      }

      accountInfoMap[result.account].balance = result.postBalance;

      if (result.postBalance == result.preBalance) {
        // this might be a 0 transaction or just one with 0 < amount < 1, the caller should cross reference these with
        // bitquery's results to determine whether it's incoming/outgoing or should be discarded
        accountInfoMap[result.account].subOneTransactions.add(
          result.transactionHash
        );
      } else if (result.preBalance === 0 && result.postBalance === -1) {
        // CloseAccount txns seems to show up as a `0 -> -1` transfer, so treat these similarly and defer to
        // bitquery about whether we care about them or not (we could go either way on whether to include these, but
        // given sfm is a lot flakier it's good to match bitquery's results, and the previous non-zero -> 0 txn would
        // already be captured in another txn so we aren't really missing any substantial transfer)
        // note that sometimes, sfm does have `non-zero -> -1` transfers (probably due to rounding), so it's not enough
        // to only check postBalance == -1, we must also check preBalance == 0
        // (e.g. 55JVfbghMEGAkTo1tCqYByJfgVm9n4g72XEa131sicxw4c32PZEp1MCZGT1Sx2JBNAoE8MurcG2f2n9wU5sg3tLA)
        accountInfoMap[result.account].subOneTransactions.add(
          result.transactionHash
        );
      } else if (result.postBalance > result.preBalance) {
        accountInfoMap[result.account].incomingTransactions.add(
          result.transactionHash
        );
      } else {
        accountInfoMap[result.account].outgoingTransactions.add(
          result.transactionHash
        );
      }
    });

  console.log(results.length, " results");

  // TODO: "transfer from 0 -> -1" seems to mean CloseAccount instruction, we're ignoring closed accounts right now,
  // in the future we could take it into account somehow (e.g. manually reduce the number of "total accounts")

  return accountInfoMap;
}
