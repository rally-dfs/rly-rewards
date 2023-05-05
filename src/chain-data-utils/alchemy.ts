import {
  Alchemy,
  Network,
  AssetTransfersCategory,
  AssetTransfersWithMetadataResult,
  AssetTransfersWithMetadataResponse,
} from "alchemy-sdk";

const TIMEOUT_BETWEEN_CALLS = 1000;

/** Fetches all transactions for each wallet between fromBlock and toBlock
 *
 * @param allWallets
 * @param fromBlock
 * @param toBlock
 * @returns dictionary with {address: AssetTransfersWithMetadataResult[]}
 */
export async function getAllAssetTransfersByAddress(
  allWallets: string[],
  fromBlock: number,
  toBlock: number
): Promise<{
  [key: string]: {
    is_incoming: boolean;
    result: AssetTransfersWithMetadataResult;
  }[];
}> {
  const config = {
    apiKey: process.env.ALCHEMY_ID,
    network: Network.MATIC_MAINNET,
  };
  const alchemy = new Alchemy(config);

  const allAssetTransfersByAddress: {
    [key: string]: {
      is_incoming: boolean;
      result: AssetTransfersWithMetadataResult;
    }[];
  } = {};

  for (let i = 0; i < allWallets.length; i++) {
    const address = allWallets[i]!;

    let allWalletAssetTransfers: {
      is_incoming: boolean;
      result: AssetTransfersWithMetadataResult;
    }[] = [];

    let pageKey = undefined;
    // infinite loop protection instead of while(true)
    for (let currentPage = 0; currentPage < 10000; currentPage++) {
      // 150 alchemy CU
      const fromAssetTransfers: AssetTransfersWithMetadataResponse =
        await alchemy.core.getAssetTransfers({
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
          fromAddress: address,
          withMetadata: true,
          pageKey: pageKey,
          category: [
            AssetTransfersCategory.EXTERNAL,
            AssetTransfersCategory.ERC1155,
            AssetTransfersCategory.ERC20,
            AssetTransfersCategory.ERC721,
            AssetTransfersCategory.SPECIALNFT,
          ],
        });

      allWalletAssetTransfers = allWalletAssetTransfers.concat(
        fromAssetTransfers.transfers.map((transfer) => ({
          is_incoming: false, // is_incoming false for these instead of true like above
          result: transfer,
        }))
      );

      if (fromAssetTransfers.pageKey === undefined) {
        break;
      } else {
        pageKey = fromAssetTransfers.pageKey;
        await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
      }
    }

    // same code as above, just with `toAddress` instead of `fromAddress` (need to have separate
    //loops for separate pagination)
    pageKey = undefined;
    // infinite loop protection instead of while(true)
    for (let currentPage = 0; currentPage < 10000; currentPage++) {
      const toAssetTransfers: AssetTransfersWithMetadataResponse =
        await alchemy.core.getAssetTransfers({
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
          toAddress: address,
          withMetadata: true,
          pageKey: pageKey,
          category: [
            AssetTransfersCategory.EXTERNAL,
            AssetTransfersCategory.ERC1155,
            AssetTransfersCategory.ERC20,
            AssetTransfersCategory.ERC721,
            AssetTransfersCategory.SPECIALNFT,
          ],
        });

      allWalletAssetTransfers = allWalletAssetTransfers.concat(
        toAssetTransfers.transfers.map((transfer) => ({
          is_incoming: true, // is_incoming true for these instead of false like above
          result: transfer,
        }))
      );

      if (toAssetTransfers.pageKey === undefined) {
        break;
      } else {
        pageKey = toAssetTransfers.pageKey;
        await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
      }
    }

    allAssetTransfersByAddress[address] = allWalletAssetTransfers;
  }
  return allAssetTransfersByAddress;
}
