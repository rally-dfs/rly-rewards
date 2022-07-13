import { BigNumber } from "bignumber.js";

import { fetchAllPagesWithQueryAndVariables } from "./bq_helpers";
import { TrackedTokenAccountInfo } from "./bq_tracked_token_base";
import { getERC20BalancesForAddressesAtBlocks } from "./ethereum";

type BitqueryEthereumTransfer = {
  // note bitquery returns this as a decimal, e.g. `12.3456` instead of `12345600000` (for 9 decimals)
  amount: number;
  sender: { address: string };
  receiver: { address: string };
  transaction: { hash: string };
  block: { height: number; timestamp: { iso8601: string } };
};

/** Similar to _solanaTransferAmountsWithFilter but for ethereum
 *
 * @param tokenMintAddress
 * @param startDateInclusive
 * @param endDateExclusive
 */
async function _ethereumTransferAmountsWithFilter(
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date
  // we don't currently need sender/receiver filters like with `_solanaTransferAmountsWithFilter` but could similarly
  // add them in the future if needed
) {
  // bitquery treats endDate as inclusive, so we need to subtract 1 millisecond from endDateExclusive
  // (bitquery doesn't have sub-second precision anyway and seems to just drop any milliseconds passed in, so this
  // is basically the same as subtracting 1 second, i.e. we should be calling T00:00:00Z to T23:59:59Z instead of
  // T00:00:00Z to T00:00:00Z to avoid duplicates/undercounting
  const endDateInclusive = new Date(endDateExclusive.valueOf() - 1);

  const queryString = `query EthTransfersForToken(
        $startTime: ISO8601DateTime!, $endTime: ISO8601DateTime!, $tokenMintAddress: String!,
        $limit: Int!, $offset: Int!) {
      ethereum {
        transfers(
          options: {limit: $limit, offset: $offset}
          time: {between: [$startTime, $endTime]}
          currency: {is: $tokenMintAddress}
          success: true
        ) {
          amount
          sender {
            address
          }
          receiver {
            address
          }
          transaction {
            hash
          }
          block {
            height
            timestamp {
              iso8601
            }
          }
        }
      }
    }`;

  const variables = {
    startTime: startDateInclusive.toISOString(),
    endTime: endDateInclusive.toISOString(),
    tokenMintAddress: tokenMintAddress,
    // `limit` and `offset` will be added by _fetchAllPagesWithQueryAndVariables
  };

  return fetchAllPagesWithQueryAndVariables<BitqueryEthereumTransfer>(
    queryString,
    variables,
    (data) => data["ethereum"]["transfers"]
  );
}

/** Similar to combined_queries.getAllTokenAccountInfoAndTransactions but for ethereum.
 *
 * Calls bitquery to get the token accounts and transactions info
 * TODO: we need to call a separate API to get balances since `transfers` doesn't have that info,
 * ethereum.address.balances.history on bitquery might work
 *
 * @param tokenMintAddress
 * @param startDateInclusive
 * @param endDateExclusive
 */
export async function getAllEthTokenAddressInfoAndTransactions(
  tokenMintAddress: string,
  tokenMintDecimals: number,
  startDateInclusive: Date,
  endDateExclusive: Date
): Promise<TrackedTokenAccountInfo[]> {
  let results = await _ethereumTransferAmountsWithFilter(
    tokenMintAddress,
    startDateInclusive,
    endDateExclusive
  );

  let accountInfoMap: { [key: string]: TrackedTokenAccountInfo } = {};

  // get balances at the most recent block
  const addressToBlocks: { [key: string]: number } = {};
  results.reduce((addressToBlocks, result) => {
    if (
      addressToBlocks[result.receiver.address] === undefined ||
      addressToBlocks[result.receiver.address]! < result.block.height
    ) {
      addressToBlocks[result.receiver.address] = result.block.height;
    }
    if (
      addressToBlocks[result.sender.address] === undefined ||
      addressToBlocks[result.sender.address]! < result.block.height
    ) {
      addressToBlocks[result.sender.address] = result.block.height;
    }
    return addressToBlocks;
  }, addressToBlocks);

  const addressToBalances = await getERC20BalancesForAddressesAtBlocks(
    tokenMintAddress,
    addressToBlocks
  );

  results.forEach((result) => {
    if (accountInfoMap[result.sender.address] === undefined) {
      accountInfoMap[result.sender.address] = {
        tokenAccountAddress: result.sender.address,
        approximateMinimumBalance: addressToBalances[result.sender.address],
        incomingTransactions: {},
        outgoingTransactions: {},
      };
    }

    if (accountInfoMap[result.receiver.address] === undefined) {
      accountInfoMap[result.receiver.address] = {
        tokenAccountAddress: result.receiver.address,
        approximateMinimumBalance: addressToBalances[result.receiver.address],
        incomingTransactions: {},
        outgoingTransactions: {},
      };
    }

    const decimalsFactor = new BigNumber(10).pow(tokenMintDecimals);

    accountInfoMap[result.sender.address]!.outgoingTransactions[
      result.transaction.hash
    ] = {
      hash: result.transaction.hash,
      transaction_datetime: new Date(result.block.timestamp.iso8601),
      amount: decimalsFactor.times(result.amount).toString(),
    };
    accountInfoMap[result.receiver.address]!.incomingTransactions[
      result.transaction.hash
    ] = {
      hash: result.transaction.hash,
      transaction_datetime: new Date(result.block.timestamp.iso8601),
      amount: decimalsFactor.times(result.amount).toString(),
    };
  });

  console.log(results.length, " results");

  // TODO: we need to call a separate API to get balances since `transfers` doesn't have that info,
  // ethereum.address.balances.history on bitquery might work, or maybe easier just to get it from on chain

  return Object.values(accountInfoMap);
}
