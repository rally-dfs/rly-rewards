import {
  clusterApiUrl,
  Connection,
  TransactionResponse,
} from "@solana/web3.js";

const SOL_NETWORK = "mainnet-beta";
const endpoint = clusterApiUrl(SOL_NETWORK);
const connection = new Connection(endpoint, "finalized");

// just exported for test mocking, shouldn't be needed in any real code
export const TEST_MOCK_ONLY_CONNECTION = connection;

export async function getSolanaTransaction(hash: string) {
  return connection.getTransaction(hash, {
    commitment: "confirmed",
  });
}

/** Calls solana `getTransaction` in a loop and returns the desired accounts' postBalances. `getTransactions` doesn't
 * seem to work on solana RPC due to rate limits but if we switch to a real RPC provider we can probably simplify this
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
          (tokenInfo.owner === tokenAccountOwnerAddress &&
            tokenInfo.mint === tokenMintAddress) ||
          // sometimes bitquery incorrectly returns the token address as the owner instead (think this happens if the
          // account is closed and rent removed, which messes with their scraping), so we can fall back on
          // using it as the account address instead and look it up in accountKeys
          tokenInfo.accountIndex ==
            txnInfo.transaction.message.accountKeys
              .map((accountKey) => accountKey.toString())
              .indexOf(tokenAccountOwnerAddress)
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
