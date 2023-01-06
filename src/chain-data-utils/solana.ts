import {
  getTransactionsTriaged,
  getTransactionTriaged,
} from "./solana_connection";

export async function getSolanaTransaction(hash: string) {
  return getTransactionTriaged(hash);
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

  const chunkSize = 10;

  const txnHashes = Object.keys(txnInfos);

  for (let i = 0; i < txnHashes.length; i += chunkSize) {
    const hashesChunk = txnHashes.slice(i, i + chunkSize);
    const transactions = await getTransactionsTriaged(hashesChunk);

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
          (tokenInfo) => {
            // sometimes bitquery incorrectly returns the token address as the owner instead (think this happens if the
            // account is closed and rent removed, which messes with their scraping), so we can fall back on
            // using it as the account address instead and look it up in accountKeys
            let isAccountIndexMatchFallback = false;
            if (txnInfo.version == "legacy") {
              // note this fallback logic doens't work for v0 txns, there's probably a way to make something similar
              // work there too if we really want to, accountKeys works differently from the legacy ones
              isAccountIndexMatchFallback =
                tokenInfo.accountIndex ==
                txnInfo.transaction.message.staticAccountKeys
                  .map((accountKey) => accountKey.toString())
                  .indexOf(tokenAccountOwnerAddress);
            }

            return (
              (tokenInfo.owner === tokenAccountOwnerAddress &&
                tokenInfo.mint === tokenMintAddress) ||
              isAccountIndexMatchFallback
            );
          }
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
