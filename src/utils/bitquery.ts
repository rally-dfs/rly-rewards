import { createApolloClient, queryApollo } from "./apollo";

const bitqueryApolloClient = createApolloClient(
  "https://graphql.bitquery.io/",
  {
    "X-API-KEY": process.env.BITQUERY_API_KEY,
    "Content-Type": "application/json",
  }
);

// wait 10 seconds between API calls (this can probably be reduced if we pay for a better plan)
const TIMEOUT_BETWEEN_CALLS = 10000;

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

// Helper for tokenAccountBalanceOnDateBitquery and tokenAccountsInfoBetweenDatesBitquery, just so we can reuse the
// code for different filters
// `tokenAccountOwnerFilter` is either "senderAddress: {is: $tokenAccountOwnerAddress}" or
// "receiverAddress: {is: $tokenAccountOwnerAddress}" or null (if no filter needed)
async function _transferAmountsWithFilter(
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date,
  tokenAccountOwnerFilter?: string,
  tokenAccountOwnerAddress?: string
) {
  // TODO: might be safer if we pass in a set of previous txn IDs or something too to prevent under/double counting

  const pageLimit = 2500;
  const maxOffset = pageLimit * 1000000; // infinite loop protection

  let allTransfers: Array<BitquerySolanaTransfer> = [];

  let offset = 0;
  let hasMorePages = true;

  while (hasMorePages && offset < maxOffset) {
    console.log("fetching offset", offset);

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

    const { data } = await queryApollo(
      bitqueryApolloClient,
      `query TransfersForSenderAndToken(
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
        `,
      {
        startTime: startDateInclusive.toISOString(),
        endTime: endDateInclusive.toISOString(),
        tokenMintAddress: tokenMintAddress,
        tokenAccountOwnerAddress: tokenAccountOwnerAddress,
        limit: pageLimit,
        offset: offset,
      }
    );

    // console.log("data", data, data["solana"]["transfers"]);

    const transfers: Array<BitquerySolanaTransfer> =
      data["solana"]["transfers"];

    allTransfers = allTransfers.concat(transfers);

    hasMorePages = transfers.length == pageLimit;
    offset += pageLimit;

    // rate limiting here in case we make too many calls
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }

  return allTransfers;
}

// Queries bitquery solana.transfers for `ownerAddress` with an end date of `endDateExclusive` (any transactions
// exactly on endDateExclusive will not be counted)
// Since bitquery results don't contain the date information and aren't guaranteed to be sorted, this is best used in
// conjunction with tokenAccountBalanceOnDateSolanaFm to just make sure there isn't anything missing in solana.fm
export async function allTransfersBetweenDatesBitquery(
  tokenAccountAddress: string,
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date
) {
  const allowedTransferTypes = new Set(["transfer", "mint", "burn"]);

  const transfersOut: Array<BitquerySolanaTransfer> =
    await _transferAmountsWithFilter(
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
    await _transferAmountsWithFilter(
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

  return filteredTransfersOut.concat(filteredTransfersOut);
}

export type BitqueryTokenAccountInfo = {
  tokenAccountAddress: string;
  balanceChange: number;
  incomingTransactions: Set<string>;
  outgoingTransactions: Set<string>;
};

// Queries bitquery solana.transfers for all token accounts belonging to `tokenMintAddress` with any activity between
// `startDate` and `endDate`
// Returns a map of {tokenAccountAddress => BitqueryTokenAccountInfo} (i.e. this would probably be used to see which
// new accounts were created that day and for updating balance/txn count for any previous accounts against some running
// db list)
//
// Any transactions exactly on startDateInclusive will be included and any exactly on endDateExclusive will not be
// included. This lets us pass in dates with T00:00:00 for both dates without double counting anything
//
// Note this interface is slightly different than tokenAccountsInfoBetweenDatesSolanaFm. Since bitquery
// solana.transfers doesn't have any balances, we return the change in balance between startDate and endDate rather
// than the final balance (so this must be combined with some previous call's balance or called multiple times)
export async function tokenAccountsInfoBetweenDatesBitquery(
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date
) {
  let results = await _transferAmountsWithFilter(
    tokenMintAddress,
    startDateInclusive,
    endDateExclusive,
    undefined,
    undefined
  );

  let accountInfoMap: { [key: string]: BitqueryTokenAccountInfo } = {};

  results.forEach((result) => {
    // TODO: currently ignoring "mint" "burn" and "self" (think this is when the same owner transfers
    // transfers to themselves or something) but could count them too
    if (result.transferType !== "transfer") {
      return;
    }

    if (accountInfoMap[result.sender.mintAccount] === undefined) {
      accountInfoMap[result.sender.mintAccount] = {
        tokenAccountAddress: result.sender.mintAccount,
        balanceChange: 0,
        incomingTransactions: new Set<string>(),
        outgoingTransactions: new Set<string>(),
      };
    }

    if (accountInfoMap[result.receiver.mintAccount] === undefined) {
      accountInfoMap[result.receiver.mintAccount] = {
        tokenAccountAddress: result.receiver.mintAccount,
        balanceChange: 0,
        incomingTransactions: new Set<string>(),
        outgoingTransactions: new Set<string>(),
      };
    }

    accountInfoMap[result.sender.mintAccount].balanceChange -= result.amount;
    accountInfoMap[result.receiver.mintAccount].balanceChange += result.amount;

    accountInfoMap[result.sender.mintAccount].outgoingTransactions.add(
      result.transaction.signature
    );
    accountInfoMap[result.receiver.mintAccount].incomingTransactions.add(
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
export async function getTransactionSuccessForHashesBitquery(
  transactionHashes: Array<string>
) {
  const pageLimit = 75; // TODO: this times out sometimes even at 100? need to figure out the right limit

  let hashToSuccessMap: { [key: string]: boolean } = {};

  for (let i = 0; i < transactionHashes.length; i += pageLimit) {
    const transactionSlices = transactionHashes.slice(i, i + pageLimit);

    const { data } = await queryApollo(
      bitqueryApolloClient,
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
