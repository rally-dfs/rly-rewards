import { Connection } from "@solana/web3.js";

const endpoint = "https://ssc-dao.genesysgo.net/";
const connection = new Connection(endpoint, "finalized");

// just exported for test mocking, shouldn't be needed in any real code
export const TEST_MOCK_ONLY_CONNECTION = connection;

export async function getSolanaTransaction(hash: string) {
  return connection.getTransaction(hash, {
    commitment: "confirmed",
  });
}

/** Calls solana `getTransaction` in a loop and returns the desired accounts' postBalances.
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

  const chunkSize = 200;

  const txnHashes = Object.keys(txnInfos);

  for (let i = 0; i < txnHashes.length; i += chunkSize) {
    const hashesChunk = txnHashes.slice(i, i + chunkSize);
    const transactions = await connection.getTransactions(
      hashesChunk,
      "confirmed"
    );

    transactions.forEach((txnInfo, index) => {
      const hash = hashesChunk[index]!;

      if (txnInfo == null) {
        retries[hash] = txnInfos[hash]!;
        return;
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
    });

    // rate limit is 200 RPC/second, pause 1 second after each chunk
    await new Promise((f) => setTimeout(f, 1000));
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
