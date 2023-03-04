import { Transaction, TransactionReceipt } from "web3-core";
import { BlockTransactionString } from "web3-eth";
import Web3 from "web3";
import { AbiItem } from "web3-utils";

const TIMEOUT_BETWEEN_CALLS = 1000;

// const web3 = new Web3(
//   `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_ID}`
// );
// TODO: fix me, just placeholder testing stuff
const web3Mumbai = new Web3(
  `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_ETH_ID}`
);

// TODO: just for testing/debugging, probably dont need this method
async function _getTransactionsBatched(allTransactionHashes: string[]) {
  const batch = new web3Mumbai.BatchRequest();

  const chunkSize = 17; // 17 CU * 17 calls = 289 CU (limit is ~330 CU/s)

  let transactions: { [key: string]: Transaction } = {};

  for (let i = 0; i < allTransactionHashes.length; i += chunkSize) {
    const transactionHashesChunk = allTransactionHashes.slice(i, i + chunkSize);

    const total = transactionHashesChunk.length;
    let counter = 0;

    await new Promise(function (resolve, reject) {
      const callback = (error: Error, txn: Transaction) => {
        if (error) {
          return reject(error);
        }

        counter++;
        transactions[txn.hash] = txn;

        if (counter === total) {
          resolve(transactions);
        }
      };

      transactionHashesChunk.forEach((hash) => {
        batch.add(
          // 15 alchemy CU
          (web3Mumbai.eth.getTransaction as any).request(hash, callback)
        );
      });

      batch.execute();
    });

    // rate limiting here so we only use ~300 CU/s
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }

  return transactions;
}

export async function getTransactionReceiptsBatched(
  allTransactionHashes: string[]
) {
  const batch = new web3Mumbai.BatchRequest();

  const chunkSize = 20; // 15 CU * 20 calls = 300 CU (limit is ~330 CU/s)

  let transactionReceipts: { [key: string]: TransactionReceipt } = {};

  for (let i = 0; i < allTransactionHashes.length; i += chunkSize) {
    const transactionHashesChunk = allTransactionHashes.slice(i, i + chunkSize);

    const total = transactionHashesChunk.length;
    let counter = 0;

    await new Promise(function (resolve, reject) {
      const callback = (error: Error, receipt: TransactionReceipt) => {
        if (error) {
          return reject(error);
        }

        counter++;
        transactionReceipts[receipt.transactionHash] = receipt;

        if (counter === total) {
          resolve(transactionReceipts);
        }
      };

      transactionHashesChunk.forEach((hash) => {
        batch.add(
          // 15 alchemy CU
          (web3Mumbai.eth.getTransactionReceipt as any).request(hash, callback)
        );
      });

      batch.execute();
    });

    // rate limiting here so we only use ~300 CU/s
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }

  return transactionReceipts;
}

async function _getBlocksForBlockNumbers(allBlockNumbers: number[]) {
  const batch = new web3Mumbai.BatchRequest();

  const chunkSize = 20; // 16 CU * 20 calls = 320 CU (limit is ~330 CU/s)

  let blocks: { [key: number]: BlockTransactionString } = {};

  for (let i = 0; i < allBlockNumbers.length; i += chunkSize) {
    const blockNumbersChunk = allBlockNumbers.slice(i, i + chunkSize);

    const total = blockNumbersChunk.length;
    let counter = 0;

    await new Promise(function (resolve, reject) {
      const callback = (error: Error, block: BlockTransactionString) => {
        if (error) {
          return reject(error);
        }

        counter++;
        blocks[block.number] = block;

        if (counter === total) {
          resolve(blocks);
        }
      };

      blockNumbersChunk.forEach((blockNumber) => {
        batch.add(
          // 16 alchemy CU
          (web3Mumbai.eth.getBlock as any).request(blockNumber, callback)
        );
      });

      batch.execute();
    });

    // rate limiting here so we only use ~300 CU/s
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }

  return blocks;
}

/** Helper method for fetching on chain info for events, i.e. EventData, TransactionReceipt, and BlockTransaction
 * First gets all events for the contracts in contractAddressToABI (between fromBlock and toBlock, inclusive)
 * Then gets associated metadata that we want for it, i.e. transaction receipts and block metadata
 *
 * @param contractAddressToABI dictionary of contract address to ABI for that contract
 * @param fromBlock
 * @param toBlock
 * @returns
 */
export async function getEventsTransactionReceiptsAndBlocksFromContracts(
  contractAddressToABI: { [key: string]: AbiItem[] },
  fromBlock: number,
  toBlock: number
) {
  const getEventsPromises = Object.entries(contractAddressToABI).map(
    ([contractAddress, contractABI]) => {
      console.log(`address ${contractAddress}`);

      const contract = new web3Mumbai.eth.Contract(
        contractABI,
        contractAddress
      );

      // TODO: need pagination/rate limiting here?
      return contract.getPastEvents("AllEvents", {
        fromBlock: fromBlock,
        toBlock: toBlock,
      });
    }
  );

  const allContractEvents = (await Promise.all(getEventsPromises)).flat();

  // console.log(`events ${JSON.stringify(allContractEvents)}`);

  const transactionHashes = [
    ...new Set(allContractEvents.map((eventData) => eventData.transactionHash)),
  ];

  const transactions = await _getTransactionsBatched(transactionHashes);

  const transactionReceipts = await getTransactionReceiptsBatched(
    transactionHashes
  );

  // console.log(`receipts ${JSON.stringify(transactionReceipts)}`);

  const blockNumbers = [
    ...new Set(
      allContractEvents.map((eventData) => eventData.blockNumber).flat()
    ),
  ];

  const blocks = await _getBlocksForBlockNumbers(blockNumbers);

  // console.log(`blocks ${JSON.stringify(blocks)}`);

  return {
    events: allContractEvents,
    transactions,
    receipts: transactionReceipts,
    blocks,
  };
}
