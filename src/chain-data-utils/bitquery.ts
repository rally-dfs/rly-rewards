import { queryGQL } from "./graphql";

async function _queryBitqueryGQL(queryString: string, variables?: object) {
  let headers = [
    ["X-API-KEY", process.env.BITQUERY_API_KEY!],
    ["Content-Type", "application/json"],
  ];
  return await queryGQL(
    "https://graphql.bitquery.io/",
    queryString,
    variables,
    headers
  );
}

// wait 10 seconds between API calls (this can probably be reduced if we pay for a better plan)
const TIMEOUT_BETWEEN_CALLS = 10000;

/** Helper to handle getting all pages of results (with rate limiting built in)
 *
 * @param queryString graphql query as a string. Must include `limit` and `offset` as inputs
 * @param variables variables (`limit` and `offset` will be added to this)
 * @param dataPath function used to extract desired results array from the raw json object
 * @returns list of parametrized objects, e.g. BitquerySolanaTransfer or BitqueryEthereumTransfer
 */
async function _fetchAllPagesWithQueryAndVariables<T>(
  queryString: string,
  variables: any,
  dataPath: (data: any) => Array<T>
) {
  const pageLimit = 2500;
  const maxOffset = pageLimit * 1000000; // infinite loop protection

  let allTransfers: Array<T> = [];

  let offset = 0;
  let hasMorePages = true;

  while (hasMorePages && offset < maxOffset) {
    console.log("fetching offset", offset);

    variables["limit"] = pageLimit;
    variables["offset"] = offset;

    const data = await _queryBitqueryGQL(queryString, variables);

    const transfers: Array<T> = dataPath(data);

    allTransfers = allTransfers.concat(transfers);

    hasMorePages = transfers.length == pageLimit;
    offset += pageLimit;

    // rate limiting here in case we make too many calls
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }

  return allTransfers;
}

type BitquerySolanaTransfer = {
  amount: number;
  transferType: string; // "transfer" "mint" "burn" "self", maybe others?
  transaction: BitquerySolanaTransaction;
  sender: BitquerySolanaTransferAccount;
  receiver: BitquerySolanaTransferAccount;
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
async function _solanaTransferAmountsWithFilter(
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date,
  tokenAccountOwnerFilter?: string,
  tokenAccountOwnerAddress?: string
) {
  // make sure to only include the gql variable if we have a filter
  const tokenAccountOwnerFilterString = tokenAccountOwnerFilter
    ? tokenAccountOwnerFilter
    : "";
  const tokenAccountOwnerVariableString = tokenAccountOwnerFilter
    ? "$tokenAccountOwnerAddress: String!,"
    : "";

  // bitquery treats endDate as inclusive, so we need to subtract 1 millisecond from endDateExclusive
  // (bitquery doesn't have sub-second precision anyway and seems to just drop any milliseconds passed in, so this
  // is basically the same as subtracting 1 second, i.e. we should be calling T00:00:00Z to T23:59:59Z instead of
  // T00:00:00Z to T00:00:00Z to avoid duplicates/undercounting
  const endDateInclusive = new Date(endDateExclusive.valueOf() - 1);

  const queryString = `query TransfersForSenderAndToken(
      $startTime: ISO8601DateTime!, $endTime: ISO8601DateTime!,
      $tokenMintAddress: String!,
      ${tokenAccountOwnerVariableString}
      $limit: Int!, $offset: Int!) {
    solana {
      transfers(
        options: {limit: $limit, offset: $offset}
        time: {between: [$startTime, $endTime]}
        currency: {is: $tokenMintAddress}
        ${tokenAccountOwnerFilterString}
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
      }
    }
  }
  `;

  const variables = {
    startTime: startDateInclusive.toISOString(),
    endTime: endDateInclusive.toISOString(),
    tokenMintAddress: tokenMintAddress,
    tokenAccountOwnerAddress: tokenAccountOwnerAddress,
    // `limit` and `offset` will be added by _fetchAllPagesWithQueryAndVariables
  };

  return _fetchAllPagesWithQueryAndVariables<BitquerySolanaTransfer>(
    queryString,
    variables,
    (data) => data["solana"]["transfers"]
  );
}

// Queries bitquery solana.transfers for `ownerAddress` with an end date of `endDateExclusive` (any transactions
// exactly on endDateExclusive will not be counted)
// Since bitquery results don't contain the date information and aren't guaranteed to be sorted, this is best used in
// conjunction with tokenAccountBalanceOnDateSolanaFm to just make sure there isn't anything missing in solana.fm
export async function allSolanaTransfersBetweenDatesBitquery(
  tokenAccountAddress: string,
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date
) {
  const allowedTransferTypes = new Set(["transfer", "mint", "burn"]);

  const transfersOut: Array<BitquerySolanaTransfer> =
    await _solanaTransferAmountsWithFilter(
      tokenMintAddress,
      startDateInclusive,
      endDateExclusive,
      "senderAddress: {is: $tokenAccountOwnerAddress}",
      tokenAccountOwnerAddress
    );

  const filteredTransfersOut = transfersOut.filter((transfer) => {
    return (
      allowedTransferTypes.has(transfer.transferType) &&
      // this owner might have other token accounts so filter those out
      transfer.sender.mintAccount == tokenAccountAddress &&
      transfer.transaction.success
    );
  });

  // same as transfersOut but filter by `receiverAddress` instead of `senderAddress`
  const transfersIn: Array<BitquerySolanaTransfer> =
    await _solanaTransferAmountsWithFilter(
      tokenMintAddress,
      startDateInclusive,
      endDateExclusive,
      "receiverAddress: {is: $tokenAccountOwnerAddress}",
      tokenAccountOwnerAddress
    );

  // same as totalTransfersOut but filter by `transfer.receiver` instead of `transfer.sender`
  const filteredTransfersIn = transfersIn.filter((transfer) => {
    return (
      allowedTransferTypes.has(transfer.transferType) &&
      // this owner might have other token accounts so filter those out
      transfer.receiver.mintAccount == tokenAccountAddress &&
      transfer.transaction.success
    );
  });

  return filteredTransfersOut.concat(filteredTransfersIn);
}

export type BitquerySolanaTrackedTokenAccountInfo = {
  tokenAccountAddress: string;
  ownerAccountAddress?: string;
  balanceChange: number;
  incomingTransactions: Set<string>;
  outgoingTransactions: Set<string>;
};

// Queries bitquery solana.transfers for all token accounts belonging to `tokenMintAddress` with any activity between
// `startDate` and `endDate`
// Returns a map of {tokenAccountAddress => BitquerySolanaTrackedTokenAccountInfo} (i.e. this would probably be used to see which
// new accounts were created that day and for updating balance/txn count for any previous accounts against some running
// db list)
//
// Any transactions exactly on startDateInclusive will be included and any exactly on endDateExclusive will not be
// included. This lets us pass in dates with T00:00:00 for both dates without double counting anything
//
// Note this interface is slightly different than tokenAccountsInfoBetweenDatesSolanaFm. Since bitquery
// solana.transfers doesn't have any balances, we return the change in balance between startDate and endDate rather
// than the final balance (so this must be combined with some previous call's balance or called multiple times)
export async function solanaTrackedTokenAccountsInfoBetweenDatesBitquery(
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date
) {
  let results = await _solanaTransferAmountsWithFilter(
    tokenMintAddress,
    startDateInclusive,
    endDateExclusive,
    undefined,
    undefined
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
        balanceChange: 0,
        incomingTransactions: new Set<string>(),
        outgoingTransactions: new Set<string>(),
      };
    }

    if (accountInfoMap[result.receiver.mintAccount] === undefined) {
      accountInfoMap[result.receiver.mintAccount] = {
        tokenAccountAddress: result.receiver.mintAccount,
        ownerAccountAddress: result.receiver.address,
        balanceChange: 0,
        incomingTransactions: new Set<string>(),
        outgoingTransactions: new Set<string>(),
      };
    }

    accountInfoMap[result.sender.mintAccount]!.balanceChange -= result.amount;
    accountInfoMap[result.receiver.mintAccount]!.balanceChange += result.amount;

    accountInfoMap[result.sender.mintAccount]!.outgoingTransactions.add(
      result.transaction.signature
    );
    accountInfoMap[result.receiver.mintAccount]!.incomingTransactions.add(
      result.transaction.signature
    );
  });

  console.log(results.length, " results");

  // TODO: we're ignoring closed accounts right now, in the future we could take it into account somehow (e.g. manually
  // reduce the number of "total accounts")

  return accountInfoMap;
}

// Queries solana.transactions for the transactions in transactionHashes
// Returns a map of {txnHash: success}
export async function getSolanaTransactionSuccessForHashesBitquery(
  transactionHashes: Array<string>
) {
  const pageLimit = 75; // TODO: this times out sometimes even at 100? need to figure out the right limit

  let hashToSuccessMap: { [key: string]: boolean } = {};

  for (let i = 0; i < transactionHashes.length; i += pageLimit) {
    const transactionSlices = transactionHashes.slice(i, i + pageLimit);

    const data = await _queryBitqueryGQL(
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
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }

  return hashToSuccessMap;
}
