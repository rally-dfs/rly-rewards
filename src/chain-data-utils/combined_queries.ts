import {
  clusterApiUrl,
  Connection,
  TransactionResponse,
} from "@solana/web3.js";

import {
  allSolanaTransfersBetweenDatesBitquery,
  BitquerySolanaTrackedTokenAccountInfo,
  solanaTrackedTokenAccountsInfoBetweenDatesBitquery,
} from "./bitquery";

const SOL_NETWORK = "mainnet-beta";
const endpoint = clusterApiUrl(SOL_NETWORK);
const connection = new Connection(endpoint, "finalized");

/** Calls solana `getTransaction` in a loop and returns the desired accounts' postBalances. `getTransactions` doesn't
 * seem to work on solana RPC due to rate limits but if we switch to a real RPC provider we can probably simplify this
 *
 * TODO: this should be moved to a different file with the other solana on chain code
 *
 * @param txnInfos dictionary of {txn_hash: [list of tokenAccountOwnerAddresses to fetch balances for]}
 * @param tokenMintAddress token mint address. Calling this is only supported for one mint at a time
 * @param retryLimit number of retries for failed txn hashes, solana RPC is flaky sometimes
 * @return dictionary {txn_hash: {tokenAccountOwnerAddresses: balance}}
 */
export async function getMultipleSolanaTransactionBalances(
  txnInfos: { [key: string]: string[] },
  tokenMintAddress: string,
  retryLimit: number
) {
  const results: { [key: string]: { [key: string]: number } } = {};
  const retries: { [key: string]: string[] } = {};

  const txnHashes = Object.keys(txnInfos);

  for (let i = 0; i < txnHashes.length; i++) {
    // TODO: this is just using solana.com's RPC limits, can adjust a real rate limit later
    if (i != 0 && i % 40 == 0) {
      await new Promise((f) => setTimeout(f, 13000));
    }

    const hash = txnHashes[i]!;

    let txnInfo: TransactionResponse;
    try {
      // batching these with Promises.all also causes rate limit overflows so just do it one at a time
      const response = await connection.getTransaction(hash, {
        commitment: "confirmed",
      });
      if (!response) {
        throw Error("Empty txnInfo returned");
      }

      txnInfo = response;
    } catch (error) {
      retries[hash] = txnInfos[hash]!;
      continue;
    }

    results[hash] = {};

    const ownerAddresses = txnInfos[hash]!;
    ownerAddresses.forEach((tokenAccountOwnerAddress) => {
      const balances = txnInfo?.meta?.postTokenBalances?.filter(
        (tokenInfo) =>
          tokenInfo.owner === tokenAccountOwnerAddress &&
          tokenInfo.mint === tokenMintAddress
      );

      if (!balances || balances.length === 0) {
        console.error(
          `Couldn't find on chain balance for ${hash} and ${tokenAccountOwnerAddress}`
        );
        return undefined;
      }

      if (balances.length > 1) {
        // this error is nonfatal (shouldn't really happen anyway unless there's a solana error)
        console.error(
          `Found more than 1 token account for txn ${hash} and ${tokenAccountOwnerAddress}`
        );
      }

      results[hash]![tokenAccountOwnerAddress] = parseInt(
        balances[0]!.uiTokenAmount.amount
      );
    });
  }

  // if retries are on, recursively call and merge results
  if (retryLimit >= 0 && Object.keys(retries).length > 0) {
    console.log(
      `Retrying solana getTransactions, ${retryLimit} remaining. Hashes ${Object.keys(
        retries
      )}`
    );

    const retryResults = await getMultipleSolanaTransactionBalances(
      retries,
      tokenMintAddress,
      retryLimit - 1
    );

    Object.entries(retryResults).forEach(([hash, balances]) => {
      results[hash] = balances;
    });
  }

  return results;
}

export async function tokenAccountBalanceOnDate(
  tokenAccountAddress: string,
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  endDateExclusive: Date,
  previousBalance: number,
  previousEndDateExclusive: Date
) {
  // load all transfers in
  const transfersBQ = (
    await allSolanaTransfersBetweenDatesBitquery(
      tokenAccountAddress,
      tokenAccountOwnerAddress,
      tokenMintAddress,
      previousEndDateExclusive,
      endDateExclusive
    )
  ).sort(
    (txn1, txn2) =>
      new Date(txn2.block.timestamp.iso8601).getTime() -
      new Date(txn1.block.timestamp.iso8601).getTime()
  );

  const latestTxnHash = transfersBQ[0]?.transaction.signature;

  if (latestTxnHash === undefined) {
    // both solana.fm and bitquery didn't return any txns, likely just no txns on that day
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
    console.error("Couldn't find on chain balance", latestTxnHash);
    return undefined;
  }

  if (balances.length > 1) {
    // this error is nonfatal (shouldn't really happen anyway unless there's a solana error)
    console.error("Found more than 1 token account for txn", latestTxnHash);
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
  latestEndDateExclusive: Date
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
        previousEndDateExclusive
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
      console.error(
        "Error fetching balance",
        tokenAccountAddress,
        currentEndDateExclusive,
        previousEndDateExclusive,
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
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }

  console.log("balances", allBalances);

  return allBalances;
}

export type TrackedTokenAccountInfoTransaction = {
  hash: string;
  transaction_datetime: Date;
  amount: string; // needs to be string since eth values can overflow `number`
};

export type TrackedTokenAccountInfo = {
  tokenAccountAddress: string;
  ownerAccountAddress?: string;
  approximateMinimumBalance?: string;
  incomingTransactions: { [key: string]: TrackedTokenAccountInfoTransaction };
  outgoingTransactions: { [key: string]: TrackedTokenAccountInfoTransaction };
};

/** Calls both bitquery and solana.fm versions of getAllTrackedTokenAccountInfo for tokenMintAddress from
 * start date (inclusive) to end date (exclusive). Returns the transactions from bitquery and the balance at
 * endDate from solana.fm
 *
 * @param tokenMintAddress
 * @param startDateInclusive
 * @param endDateExclusive
 */
export async function getAllSolanaTrackedTokenAccountInfoAndTransactions(
  tokenMintAddress: string,
  tokenMintDecimals: number,
  startDateInclusive: Date,
  endDateExclusive: Date
): Promise<TrackedTokenAccountInfo[]> {
  // bitquery token accounts info
  // note this returns delta(balance) from startDate instead of actual balance (not used for now)
  let tokenAccountsInfoBQMap =
    await solanaTrackedTokenAccountsInfoBetweenDatesBitquery(
      tokenMintAddress,
      tokenMintDecimals,
      startDateInclusive,
      endDateExclusive
    );

  // get on chain balances for txns
  // transform into {transaction_hash: [accountAddress]}
  const accountAddressesByTxnHash: { [key: string]: string[] } = {};

  Object.values(tokenAccountsInfoBQMap).forEach((bqAccountInfo) => {
    Object.keys(bqAccountInfo.incomingTransactions)
      .concat(Object.keys(bqAccountInfo.outgoingTransactions))
      .forEach((txn) => {
        if (accountAddressesByTxnHash[txn] === undefined) {
          accountAddressesByTxnHash[txn] = [];
        }
        accountAddressesByTxnHash[txn]?.push(bqAccountInfo.ownerAccountAddress);
      });
  });

  const allChainBalances = await getMultipleSolanaTransactionBalances(
    accountAddressesByTxnHash,
    tokenMintAddress,
    2
  );

  return Object.values(tokenAccountsInfoBQMap).map((bqAccountInfo) => {
    // get the most recent transaction for this account and pull the balance from allChainBalances
    let approximateMinimumBalance = _getOnChainBalanceForAccountInfo(
      bqAccountInfo,
      allChainBalances
    );

    return {
      tokenAccountAddress: bqAccountInfo.tokenAccountAddress,
      ownerAccountAddress: bqAccountInfo.ownerAccountAddress,
      approximateMinimumBalance: approximateMinimumBalance?.toString(),
      incomingTransactions: bqAccountInfo.incomingTransactions,
      outgoingTransactions: bqAccountInfo.outgoingTransactions,
    };
  });
}

/** Helper function to find the most recent txn for bqAccountInfo.ownerAccountAddresss in allChainBalances
 * If that txn isn't found (i.e. the on chain call failed), fall back on whatever txn we can for this owner and
 * add up bitquery's balance deltas manually
 *
 * @param bqAccountInfo
 * @param allChainBalances
 * @returns balance
 */
function _getOnChainBalanceForAccountInfo(
  bqAccountInfo: BitquerySolanaTrackedTokenAccountInfo,
  allChainBalances: { [key: string]: { [key: string]: number } }
) {
  const allAccountTransactionInfos = Object.values(
    bqAccountInfo.incomingTransactions
  ).concat(Object.values(bqAccountInfo.outgoingTransactions));

  const sortedAccountTransactionInfos = allAccountTransactionInfos
    .filter(
      (info) =>
        info.transaction_datetime !== undefined &&
        allChainBalances[info.hash] !== undefined &&
        allChainBalances[info.hash]![bqAccountInfo.ownerAccountAddress] !==
          undefined
    )
    .sort(
      (info1, info2) =>
        info2.transaction_datetime.getTime() -
        info1.transaction_datetime.getTime()
    );

  const mostRecentTransactionInfo = sortedAccountTransactionInfos[0];

  let approximateMinimumBalance;

  if (mostRecentTransactionInfo) {
    // if the most recent one wasn't available on chain for some reason, try to calculate it manually by adding up
    // any `amounts` that happened after mostRecentTransactionInfo
    const followingTransactions = allAccountTransactionInfos.filter(
      (info) =>
        info.transaction_datetime >
        mostRecentTransactionInfo.transaction_datetime
    );

    const followingTransactionsSum = followingTransactions.reduce(
      (acc, info) => {
        if (
          Object.keys(bqAccountInfo.incomingTransactions).indexOf(info.hash) !==
          -1
        ) {
          return acc + parseInt(info.amount);
        }
        if (
          Object.keys(bqAccountInfo.outgoingTransactions).indexOf(info.hash) !==
          -1
        ) {
          return acc - parseInt(info.amount);
        }
        console.error(
          `Transaction hash not found in either incoming or outgoing txns ${JSON.stringify(
            info
          )} ${JSON.stringify(bqAccountInfo)}`
        );
        return acc;
      },
      0
    ); // TODO: should use some bignumber lib here instead

    approximateMinimumBalance =
      allChainBalances[mostRecentTransactionInfo.hash]![
        bqAccountInfo.ownerAccountAddress
      ]! + followingTransactionsSum;
  }
  return approximateMinimumBalance;
}
