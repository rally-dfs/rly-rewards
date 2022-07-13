import { BigNumber } from "bignumber.js";
import {
  fetchAllPagesWithQueryAndVariables,
  queryBitqueryGQL,
} from "./bq_helpers";

import {
  TrackedTokenAccountInfo,
  TrackedTokenAccountInfoTransaction,
} from "./bq_tracked_token_base";
import { BITQUERY_TIMEOUT_BETWEEN_CALLS } from "./constants";
import { getMultipleSolanaTransactionBalances } from "./solana";

/** Queries bitquery solana.transfers for all token accounts belonging to `tokenMintAddress` with any activity between
 * `startDate` and `endDate`
 * Returns a map of {tokenAccountAddress => BitquerySolanaTrackedTokenAccountInfo} (i.e. this would probably be used to see which
 * new accounts were created that day and for updating balance/txn count for any previous accounts against some running
 * db list)
 *
 * Any transactions exactly on startDateInclusive will be included and any exactly on endDateExclusive will not be
 * included. This lets us pass in dates with T00:00:00 for both dates without double counting anything
 *
 * @param tokenMintAddress
 * @param tokenMintDecimals
 * @param startDateInclusive
 * @param endDateExclusive
 * @returns
 */

async function _solanaTrackedTokenAccountsInfoBetweenDatesBitquery(
  tokenMintAddress: string,
  // bitquery returns base units for solana, not sure if it's intentional or not (differs from bitquery's eth response),
  // but we don't tokenMintDecimals if it is intentional
  _tokenMintDecimals: number,
  startDateInclusive: Date,
  endDateExclusive: Date
) {
  let results = await _allSolanaTransferAmounts(
    tokenMintAddress,
    startDateInclusive,
    endDateExclusive
  );

  let accountInfoMap: { [key: string]: BitquerySolanaTrackedTokenAccountInfo } =
    {};

  results.forEach((result) => {
    // TODO: currently ignoring "mint" "burn" and "self" (think this is when the same owner transfers
    // transfers to themselves or something) but could count them too
    if (result.transferType !== "transfer") {
      return;
    }

    if (accountInfoMap[result.sender.mintAccount] === undefined) {
      accountInfoMap[result.sender.mintAccount] = {
        tokenAccountAddress: result.sender.mintAccount,
        ownerAccountAddress: result.sender.address,
        incomingTransactions: {},
        outgoingTransactions: {},
      };
    }

    if (accountInfoMap[result.receiver.mintAccount] === undefined) {
      accountInfoMap[result.receiver.mintAccount] = {
        tokenAccountAddress: result.receiver.mintAccount,
        ownerAccountAddress: result.receiver.address,
        incomingTransactions: {},
        outgoingTransactions: {},
      };
    }

    accountInfoMap[result.sender.mintAccount]!.outgoingTransactions[
      result.transaction.signature
    ] = {
      hash: result.transaction.signature,
      transaction_datetime: new Date(result.block.timestamp.iso8601),
      amount: result.amount.toString(), // note unlike eth, bitquery returns the base units here instead of decimals
    };
    accountInfoMap[result.receiver.mintAccount]!.incomingTransactions[
      result.transaction.signature
    ] = {
      hash: result.transaction.signature,
      transaction_datetime: new Date(result.block.timestamp.iso8601),
      amount: result.amount.toString(),
    };
  });

  console.log(results.length, " results");

  // TODO: we're ignoring closed accounts right now, in the future we could take it into account somehow (e.g. manually
  // reduce the number of "total accounts")

  return accountInfoMap;
}

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
    await _solanaTrackedTokenAccountsInfoBetweenDatesBitquery(
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
      approximateMinimumBalance: approximateMinimumBalance,
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
          return acc.plus(info.amount);
        }
        if (
          Object.keys(bqAccountInfo.outgoingTransactions).indexOf(info.hash) !==
          -1
        ) {
          return acc.minus(info.amount);
        }
        console.error(
          `Transaction hash not found in either incoming or outgoing txns ${JSON.stringify(
            info
          )} ${JSON.stringify(bqAccountInfo)}`
        );
        return acc;
      },
      new BigNumber(0)
    );

    approximateMinimumBalance = followingTransactionsSum
      .plus(
        allChainBalances[mostRecentTransactionInfo.hash]![
          bqAccountInfo.ownerAccountAddress
        ]!
      )
      .toString();
  }
  return approximateMinimumBalance;
}

type BitquerySolanaTransfer = {
  amount: number; // note bitquery returns this as a decimal, e.g. `12.3456` instead of `12345600000` (for 9 decimals)
  transferType: string; // "transfer" "mint" "burn" "self", maybe others?
  transaction: BitquerySolanaTransaction;
  sender: BitquerySolanaTransferAccount;
  receiver: BitquerySolanaTransferAccount;
  block: { timestamp: { iso8601: string } };
};
type BitquerySolanaTransaction = {
  signature: string;
  success: boolean;
};
type BitquerySolanaTransferAccount = {
  address: string;
  mintAccount: string;
  type: string; // i think this is always "account"?
};

/** Helper for tokenAccountBalanceOnDateBitquery and tokenAccountsInfoBetweenDatesBitquery, just so we can reuse the
 * code for different filters
 *
 * @param tokenMintAddress
 * @param startDateInclusive
 * @param endDateExclusive
 * @param tokenAccountOwnerFilter either "senderAddress: {is: $tokenAccountOwnerAddress}" or
 * "receiverAddress: {is: $tokenAccountOwnerAddress}" or undefined (if no filter needed)
 * @param tokenAccountOwnerAddress only needed if `tokenAccountOwnerFilter` is not undefined
 */
async function _allSolanaTransferAmounts(
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date
) {
  // bitquery treats endDate as inclusive, so we need to subtract 1 millisecond from endDateExclusive
  // (bitquery doesn't have sub-second precision anyway and seems to just drop any milliseconds passed in, so this
  // is basically the same as subtracting 1 second, i.e. we should be calling T00:00:00Z to T23:59:59Z instead of
  // T00:00:00Z to T00:00:00Z to avoid duplicates/undercounting
  const endDateInclusive = new Date(endDateExclusive.valueOf() - 1);

  const queryString = `query TransfersForSenderAndToken(
        $startTime: ISO8601DateTime!, $endTime: ISO8601DateTime!,
        $tokenMintAddress: String!,
        $limit: Int!, $offset: Int!) {
      solana {
        transfers(
          options: {limit: $limit, offset: $offset}
          time: {between: [$startTime, $endTime]}
          currency: {is: $tokenMintAddress}
          success: {is: true}
        ) {
          amount
          transferType
          transaction {
            signature
            success
          }
          sender {
            address
            mintAccount
            type
          }
          receiver {
            address
            mintAccount
            type
          }
          block {
            timestamp {
              iso8601
            }
          }
        }
      }
    }
    `;

  const variables = {
    startTime: startDateInclusive.toISOString(),
    endTime: endDateInclusive.toISOString(),
    tokenMintAddress: tokenMintAddress,
    // `limit` and `offset` will be added by _fetchAllPagesWithQueryAndVariables
  };

  return fetchAllPagesWithQueryAndVariables<BitquerySolanaTransfer>(
    queryString,
    variables,
    (data) => data["solana"]["transfers"]
  );
}

type BitquerySolanaTrackedTokenAccountInfo = {
  tokenAccountAddress: string;
  ownerAccountAddress: string;
  incomingTransactions: { [key: string]: TrackedTokenAccountInfoTransaction };
  outgoingTransactions: { [key: string]: TrackedTokenAccountInfoTransaction };
};

// Queries solana.transactions for the transactions in transactionHashes
// Returns a map of {txnHash: success}
export async function getSolanaTransactionSuccessForHashesBitquery(
  transactionHashes: Array<string>
) {
  const pageLimit = 75; // TODO: this times out sometimes even at 100? need to figure out the right limit

  let hashToSuccessMap: { [key: string]: boolean } = {};

  for (let i = 0; i < transactionHashes.length; i += pageLimit) {
    const transactionSlices = transactionHashes.slice(i, i + pageLimit);

    const data = await queryBitqueryGQL(
      `query TransactionsForHashes($txnHashes: [String!]!) {
        solana {
          transactions(signature: {in: $txnHashes}) {
            signature
            success
          }
        }
      }
      `,
      {
        txnHashes: transactionSlices,
      }
    );

    const transactions: Array<BitquerySolanaTransaction> =
      data["solana"]["transactions"];

    transactions.forEach((txn) => {
      hashToSuccessMap[txn.signature] = txn.success;
    });

    // rate limiting here in case we make too many calls
    await new Promise((f) => setTimeout(f, BITQUERY_TIMEOUT_BETWEEN_CALLS()));
  }

  return hashToSuccessMap;
}
