import { queryBitqueryGQL } from "./bq_helpers";
import { getSolanaTransaction } from "./solana";

/** Queries bitquery solana.transfers for `ownerAddress` with an end date of `endDateExclusive` (any transactions
 * exactly on endDateExclusive will not be counted)
 * Since bitquery results don't contain the date information and aren't guaranteed to be sorted, this is best used in
 * conjunction with tokenAccountBalanceOnDateSolanaFm to just make sure there isn't anything missing in solana.fm
 */
async function _lastSolanaTransactionBeforeDateBitquery(
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  endDateExclusive: Date
) {
  // bitquery treats endDate as inclusive, so we need to subtract 1 millisecond from endDateExclusive
  // (bitquery doesn't have sub-second precision anyway and seems to just drop any milliseconds passed in, so this
  // is basically the same as subtracting 1 second, i.e. we should be calling T00:00:00Z to T23:59:59Z instead of
  // T00:00:00Z to T00:00:00Z to avoid duplicates/undercounting
  const endDateInclusive = new Date(endDateExclusive.valueOf() - 1);

  const variables = {
    endTime: endDateInclusive.toISOString(),
    tokenMintAddress: tokenMintAddress,
    tokenAccountOwnerAddress: tokenAccountOwnerAddress,
  };

  const senderTransactionQuery = `query TransfersForSenderAndToken(
          $endTime: ISO8601DateTime!,
          $tokenMintAddress: String!,
          $tokenAccountOwnerAddress: String!) {
        solana {
          transfers(
            options: {limit: 1, desc: "block.timestamp.iso8601"}
            time: {before: $endTime}
            currency: {is: $tokenMintAddress}
            success: {is: true}
            senderAddress: {is: $tokenAccountOwnerAddress}
            transferType: {in: [transfer, mint, burn]}
          ) {
            transaction {
              signature
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

  const senderData = await queryBitqueryGQL(senderTransactionQuery, variables);

  const senderTransfers: {
    transaction: { signature: string };
    block: { timestamp: { iso8601: string } };
  }[] = senderData["solana"]["transfers"];

  // same as transfersOut but filter by `receiverAddress` instead of `senderAddress`
  const receiverTransactionQuery = `query TransfersForReceiverAndToken(
        $endTime: ISO8601DateTime!,
        $tokenMintAddress: String!,
        $tokenAccountOwnerAddress: String!) {
      solana {
        transfers(
          options: {limit: 1, desc: "block.timestamp.iso8601"}
          time: {before: $endTime}
          currency: {is: $tokenMintAddress}
          success: {is: true}
          receiverAddress: {is: $tokenAccountOwnerAddress}
          transferType: {in: [transfer, mint, burn]}
        ) {
          transaction {
            signature
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

  const receiverData = await queryBitqueryGQL(
    receiverTransactionQuery,
    variables
  );

  const receiverTransfers: {
    transaction: { signature: string };
    block: { timestamp: { iso8601: string } };
  }[] = receiverData["solana"]["transfers"];

  // get the most recent signature
  return senderTransfers
    .concat(receiverTransfers)
    .sort(
      (transfer1, transfer2) =>
        new Date(transfer2.block.timestamp.iso8601).getTime() -
        new Date(transfer1.block.timestamp.iso8601).getTime()
    )[0]?.transaction.signature;
}

export async function solanaTokenAccountBalanceOnDate(
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  endDateExclusive: Date,
  previousBalance: string
) {
  // load all transfers in
  const latestTxnHash = await _lastSolanaTransactionBeforeDateBitquery(
    tokenAccountOwnerAddress,
    tokenMintAddress,
    endDateExclusive
  );

  if (latestTxnHash === undefined) {
    return previousBalance;
  }

  let txnInfo = await getSolanaTransaction(latestTxnHash);

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

  return balances[0]!.uiTokenAmount.amount;
}
