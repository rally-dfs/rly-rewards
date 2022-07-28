import { queryBitqueryGQL } from "./bq_helpers";
import { getERC20BalanceAtBlock } from "./ethereum";

async function _lastEthTransactionBlockBeforeDateBitquery(
  tokenAccountAddress: string,
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
    tokenAccountAddress: tokenAccountAddress,
  };

  const senderTransactionQuery = `query EthTransfersForSenderToken(
      $endTime: ISO8601DateTime!, $tokenMintAddress: String!,
      $tokenAccountAddress: String!) {
    ethereum {
      transfers(
        options: {limit: 1, desc: "block.timestamp.iso8601"}
        time: {before: $endTime}
        currency: {is: $tokenMintAddress}
        sender: {is: $tokenAccountAddress}
        success: true
      ) {
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

  const senderData = await queryBitqueryGQL(senderTransactionQuery, variables);

  const senderTransfers: {
    transaction: { signature: string };
    block: { height: number; timestamp: { iso8601: string } };
  }[] = senderData["ethereum"]["transfers"];

  // same as sender but with `receiver:` filter
  const receiverTransactionQuery = `query EthTransfersForReceiverToken(
      $endTime: ISO8601DateTime!, $tokenMintAddress: String!,
      $tokenAccountAddress: String!) {
    ethereum {
      transfers(
        options: {limit: 1, desc: "block.timestamp.iso8601"}
        time: {before: $endTime}
        currency: {is: $tokenMintAddress}
        receiver: {is: $tokenAccountAddress}
        success: true
      ) {
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

  const receiverData = await queryBitqueryGQL(
    receiverTransactionQuery,
    variables
  );

  const receiverTransfers: {
    transaction: { signature: string };
    block: { height: number; timestamp: { iso8601: string } };
  }[] = receiverData["ethereum"]["transfers"];

  // get the most recent block height
  return senderTransfers
    .concat(receiverTransfers)
    .sort(
      (transfer1, transfer2) =>
        new Date(transfer2.block.timestamp.iso8601).getTime() -
        new Date(transfer1.block.timestamp.iso8601).getTime()
    )[0]?.block.height;
}

export async function ethTokenAccountBalanceOnDate(
  tokenAccountAddress: string,
  tokenMintAddress: string,
  endDateExclusive: Date,
  previousBalance?: string
) {
  const latestBlockHeight = await _lastEthTransactionBlockBeforeDateBitquery(
    tokenAccountAddress,
    tokenMintAddress,
    endDateExclusive
  );

  if (latestBlockHeight === undefined) {
    return previousBalance;
  }

  return await getERC20BalanceAtBlock(
    tokenMintAddress,
    tokenAccountAddress,
    latestBlockHeight
  );
}
