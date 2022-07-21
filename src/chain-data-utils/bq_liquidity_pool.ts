import { LiquidityCollateralTokenChain } from "../knex-types/liquidity_collateral_token";
import { queryBitqueryGQL } from "./bq_helpers";
import { BITQUERY_TIMEOUT_BETWEEN_CALLS } from "./constants";
import { getSolanaTransaction } from "./solana";
import { getERC20BalanceAtBlock } from "./ethereum";

/** Queries bitquery solana.transfers for `ownerAddress` with an end date of `endDateExclusive` (any transactions
 * exactly on endDateExclusive will not be counted)
 * Since bitquery results don't contain the date information and aren't guaranteed to be sorted, this is best used in
 * conjunction with tokenAccountBalanceOnDateSolanaFm to just make sure there isn't anything missing in solana.fm
 */
async function _lastSolanaTransactionBetweenDatesBitquery(
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date
) {
  // bitquery treats endDate as inclusive, so we need to subtract 1 millisecond from endDateExclusive
  // (bitquery doesn't have sub-second precision anyway and seems to just drop any milliseconds passed in, so this
  // is basically the same as subtracting 1 second, i.e. we should be calling T00:00:00Z to T23:59:59Z instead of
  // T00:00:00Z to T00:00:00Z to avoid duplicates/undercounting
  const endDateInclusive = new Date(endDateExclusive.valueOf() - 1);

  const variables = {
    startTime: startDateInclusive.toISOString(),
    endTime: endDateInclusive.toISOString(),
    tokenMintAddress: tokenMintAddress,
    tokenAccountOwnerAddress: tokenAccountOwnerAddress,
  };

  const senderTransactionQuery = `query TransfersForSenderAndToken(
          $startTime: ISO8601DateTime!, $endTime: ISO8601DateTime!,
          $tokenMintAddress: String!,
          $tokenAccountOwnerAddress: String!) {
        solana {
          transfers(
            options: {limit: 1, desc: "block.timestamp.iso8601"}
            time: {between: [$startTime, $endTime]}
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
        $startTime: ISO8601DateTime!, $endTime: ISO8601DateTime!,
        $tokenMintAddress: String!,
        $tokenAccountOwnerAddress: String!) {
      solana {
        transfers(
          options: {limit: 1, desc: "block.timestamp.iso8601"}
          time: {between: [$startTime, $endTime]}
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

async function _solanaTokenAccountBalanceOnDate(
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  endDateExclusive: Date,
  previousBalance: string,
  previousEndDateExclusive: Date
) {
  // load all transfers in
  const latestTxnHash = await _lastSolanaTransactionBetweenDatesBitquery(
    tokenAccountOwnerAddress,
    tokenMintAddress,
    previousEndDateExclusive,
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

async function _lastEthTransactionBlockBetweenDatesBitquery(
  tokenAccountAddress: string,
  tokenMintAddress: string,
  startDateInclusive: Date,
  endDateExclusive: Date
) {
  // bitquery treats endDate as inclusive, so we need to subtract 1 millisecond from endDateExclusive
  // (bitquery doesn't have sub-second precision anyway and seems to just drop any milliseconds passed in, so this
  // is basically the same as subtracting 1 second, i.e. we should be calling T00:00:00Z to T23:59:59Z instead of
  // T00:00:00Z to T00:00:00Z to avoid duplicates/undercounting
  const endDateInclusive = new Date(endDateExclusive.valueOf() - 1);

  const variables = {
    startTime: startDateInclusive.toISOString(),
    endTime: endDateInclusive.toISOString(),
    tokenMintAddress: tokenMintAddress,
    tokenAccountAddress: tokenAccountAddress,
  };

  const senderTransactionQuery = `query EthTransfersForSenderToken(
      $startTime: ISO8601DateTime!, $endTime: ISO8601DateTime!, $tokenMintAddress: String!,
      $tokenAccountAddress: String!) {
    ethereum {
      transfers(
        options: {limit: 1, desc: "block.timestamp.iso8601"}
        time: {between: [$startTime, $endTime]}
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
      $startTime: ISO8601DateTime!, $endTime: ISO8601DateTime!, $tokenMintAddress: String!,
      $tokenAccountAddress: String!) {
    ethereum {
      transfers(
        options: {limit: 1, desc: "block.timestamp.iso8601"}
        time: {between: [$startTime, $endTime]}
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

async function _ethTokenAccountBalanceOnDate(
  tokenAccountAddress: string,
  tokenMintAddress: string,
  endDateExclusive: Date,
  previousBalance: string,
  previousEndDateExclusive: Date
) {
  const latestBlockHeight = await _lastEthTransactionBlockBetweenDatesBitquery(
    tokenAccountAddress,
    tokenMintAddress,
    previousEndDateExclusive,
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

/** Just a readability helper function for triaging by chain */
function _tokenAccountBalanceOnDate(
  tokenAccountAddress: string,
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  chain: LiquidityCollateralTokenChain,
  currentEndDateExclusive: Date,
  previousBalance: string,
  previousEndDateExclusive: Date
) {
  if (chain === "solana") {
    return _solanaTokenAccountBalanceOnDate(
      tokenAccountOwnerAddress, // bq requires owner address for solana, not the actual address
      tokenMintAddress,
      currentEndDateExclusive,
      previousBalance,
      previousEndDateExclusive
    );
  } else if (chain === "ethereum") {
    return _ethTokenAccountBalanceOnDate(
      tokenAccountAddress, // bq requires actual address for eth (obviously)
      tokenMintAddress,
      currentEndDateExclusive,
      previousBalance,
      previousEndDateExclusive
    );
  } else {
    throw new Error(`Invalid chain ${chain}`);
  }
}

export type TokenBalanceDate = {
  dateExclusive: Date;
  balance: string;
};

// Calls tokenAccountBalanceOnDate for all balances between startDate and endDate.
// Like tokenAccountBalanceOnDate, endDate is exclusive (any transactions exactly on endDateExclusive will
// not be counted and will be included in the next day instead)
// Currently just returns an array of TokenBalanceDate but this probably will eventually be called to backfill
// all the dates for a token in the DB or something.
export async function getDailyTokenBalancesBetweenDates(
  tokenAccountAddress: string,
  tokenAccountOwnerAddress: string,
  tokenMintAddress: string,
  chain: LiquidityCollateralTokenChain,
  earliestEndDateExclusive: Date,
  latestEndDateExclusive: Date
) {
  let allBalances: Array<TokenBalanceDate> = [];

  // 0 + a date assumes the all activity happened after that date
  let previousBalance = "0";
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
      let balance = await _tokenAccountBalanceOnDate(
        tokenAccountAddress,
        tokenAccountOwnerAddress,
        tokenMintAddress,
        chain,
        currentEndDateExclusive,
        previousBalance,
        previousEndDateExclusive
      );

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
        tokenAccountOwnerAddress,
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
    await new Promise((f) => setTimeout(f, BITQUERY_TIMEOUT_BETWEEN_CALLS()));
  }

  console.log("balances", allBalances);

  return allBalances;
}
