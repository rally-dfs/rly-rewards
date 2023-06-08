import { getKnex } from "./database";
import { Knex } from "knex";
import { AbiItem } from "web3-utils";
import { EventData } from "web3-eth-contract";
import { TransactionReceipt } from "web3-core";

import { MobileSDKWallet } from "./knex-types/mobile_sdk_wallet";
import {
  MobileSDKKeyDirection,
  MobileSDKKeyTransaction,
} from "./knex-types/mobile_sdk_key_transaction";

import RLYPaymasterABI from "./chain-data-utils/abis/paymaster.json";
import TokenFaucetABI from "./chain-data-utils/abis/token_faucet.json";

import {
  getBlockNumber,
  getEventsTransactionReceiptsAndBlocksFromContracts,
  getTransactionReceiptsBatched,
} from "./chain-data-utils/polygon";
import { getAllAssetTransfersByAddress } from "./chain-data-utils/alchemy";

import { AssetTransfersWithMetadataResult } from "alchemy-sdk";
import { MobileSDKKeyTransactionType } from "./knex-types/mobile_sdk_key_transaction";
import { BlockTransactionString } from "web3-eth";
import { decodeLogWithABIAndEventName } from "./chain-data-utils/ethereum";
import { MobileSDKClientApp } from "./knex-types/mobile_sdk_client_app";

// from testing, there's a ~10K row insert limit, split the inserts into chunks in case there's too many (probably
// would mostly only happen with transactions)
const INSERT_CHUNK_SIZE = 10000;

const TOKEN_FAUCET_ADDRESS = process.env.MOBILE_SDK_MUMBAI
  ? "0xe7C3BD692C77Ec0C0bde523455B9D142c49720fF"
  : "0x78a0794Bb3BB06238ed5f8D926419bD8fc9546d8";

const EVENT_TOPIC_RLY_PAYMASTER_PRE_CALL_VALUES =
  "0x316c3804bae99d0dfbb6f7bbac42276350e161e4a35e251084448c255f1c8704";
const EVENT_TOPIC_RLY_PAYMASTER_POST_CALL_VALUES =
  "0xade5d601b68375ded0f1639e57b7b3538b90c7f0e380e8e9152361f6e1289da5";

/** Fetches all MobileSDKKeyTransactions, MobileSDKWallets, and MobileSDKClientApps
 * for the block range starting at toBlock (inclusive) and ending at fromBlock (inclusive)
 *
 * @param fromBlock if undefined, fetches from the most recently fetched block
 * @param toBlock if undefined, fetches to the most recent block on chain
 */
export async function getMobileSDKTransactions(
  fromBlock?: number,
  toBlock?: number
) {
  const knex = getKnex();

  await knex
    .transaction(async (knexTransaction) => {
      // run all of this in a single db transaction, since if the key transactions and the
      // other transactions get out of sync it can cause gaps for future fetches
      await _getMobileSDKTransactionsAtomic(
        knexTransaction,
        fromBlock,
        toBlock
      );
    })
    .then(() => {
      console.log(
        `Finished fetching Mobile SDK Transactions from ${
          fromBlock ? fromBlock : "last"
        } to ${toBlock}`
      );
    })
    .catch((error) => {
      console.log(
        `Error fetching Mobile SDK Transactions from ${
          fromBlock ? fromBlock : "last"
        } to ${toBlock}: ${error}`
      );
    });
}

async function _getMobileSDKTransactionsAtomic(
  knexTransaction: Knex.Transaction,
  fromBlock?: number,
  toBlock?: number
) {
  const contractsAndABIs = {
    [TOKEN_FAUCET_ADDRESS]: TokenFaucetABI as AbiItem[],
  };

  if (toBlock === undefined) {
    toBlock = await getBlockNumber();
    console.log(`Using most recent block ${toBlock} as toBlock`);
  }

  if (fromBlock === undefined) {
    const dbResponse = await knexTransaction<MobileSDKKeyTransaction>(
      "mobile_sdk_key_transactions"
    )
      .select("block_number")
      .orderBy("block_number", "desc")
      .limit(1);

    fromBlock = dbResponse[0] ? dbResponse[0].block_number : 0;

    if (fromBlock > toBlock) {
      throw new Error(
        "To block is less than the most recently fetched block. Specify to and from blocks explicitly."
      );
    }

    console.log(`Using most recently fetched block ${fromBlock} as fromBlock`);
  }

  console.log(
    `Fetching Mobile SDK transactions from ${fromBlock} to ${toBlock}`
  );

  const { events, receipts, blocks } =
    await getEventsTransactionReceiptsAndBlocksFromContracts(
      contractsAndABIs,
      fromBlock,
      toBlock
    );

  const namedKeyTransactionsCreated: MobileSDKKeyTransaction[] =
    await _createNamedKeyTransactions(
      knexTransaction,
      events,
      blocks,
      receipts
    );

  console.log("====== Finished claim txns, doing all other txns now =====");

  await _createAllOtherKeyTransactions(
    knexTransaction,
    namedKeyTransactionsCreated,
    fromBlock,
    toBlock
  );
}

/** Checks for the RlyPaymasterPostCallValues event for a given txn receipt
 *
 * @param receipt TransactionReceipt for txn
 * @returns
 */
function _gasPaidByRna(receipt: TransactionReceipt) {
  return (
    receipt.logs.findIndex(
      (log) =>
        log.topics.findIndex(
          (topic) => topic === EVENT_TOPIC_RLY_PAYMASTER_POST_CALL_VALUES
        ) >= 0
    ) >= 0
  );
}

/** Creates mobile_sdk_key_transactions for all the non-"other" events in `events`, with the help of metadata fetched in
 * `blocks` and `receipts`
 *
 * @param events events from result of getEventsTransactionReceiptsAndBlocksFromContracts
 * @param blocks blocks from result of getEventsTransactionReceiptsAndBlocksFromContracts
 * @param receipts receipts from result of getEventsTransactionReceiptsAndBlocksFromContracts
 * @returns the list of MobileSDKKeyTransactions created
 */
async function _createNamedKeyTransactions(
  knexTransaction: Knex.Transaction,
  events: EventData[],
  blocks: { [key: number]: BlockTransactionString },
  receipts: { [key: string]: TransactionReceipt }
) {
  // iterate through all events, pick out the ones that match transaction_types we care about
  // e.g. {"TokenFaucet.Claim": MobileSDKKeyTransactionType.token_faucet_claim}
  // TODO: should make this generic and work for multiple events once we have them, kind of placeholder for now
  const claimEvents = events.filter(
    (event) => event.address === TOKEN_FAUCET_ADDRESS && event.event === "Claim"
  );

  const walletAddresses = claimEvents.map((event) => event.returnValues.sender);

  // create or get the MSDKWallet.id wallet_id
  const walletIdsByAddress: { [key: string]: number } = {};

  for (let i = 0; i < walletAddresses.length; i += INSERT_CHUNK_SIZE) {
    const walletResults = await knexTransaction<MobileSDKWallet>(
      "mobile_sdk_wallets"
    )
      .insert(
        walletAddresses.slice(i, i + INSERT_CHUNK_SIZE).map((address) => ({
          address: address,
        })),
        "*" // need this for postgres to return the added result
      )
      .onConflict(["address"])
      .merge();

    walletResults.reduce((idMap, result) => {
      idMap[result.address] = result.id!;
      return idMap;
    }, walletIdsByAddress);
  }

  // now add all the claim events as KeyTransactions
  const claimKeyTransactions: MobileSDKKeyTransaction[] = claimEvents.map(
    (event) => ({
      wallet_id: walletIdsByAddress[event.returnValues.sender]!,
      transaction_type: "token_faucet_claim",
      transaction_hash: event.transactionHash,
      block_number: event.blockNumber,
      datetime: new Date(
        parseInt(blocks[event.blockNumber]?.timestamp as string) * 1000
      ),
      direction: "incoming", // token_faucet_claims are all incoming
      amount: event.returnValues.amount,
      gas_amount: receipts[event.transactionHash]?.gasUsed.toString()!,
      gas_price: receipts[event.transactionHash]?.effectiveGasPrice.toString()!,
      // if we can't find the receipts treat it as fatal, gas_paid_by_rna more important than some of the metadata above
      gas_paid_by_rna: _gasPaidByRna(receipts[event.transactionHash]!),
    })
  );

  for (let i = 0; i < claimKeyTransactions.length; i += INSERT_CHUNK_SIZE) {
    await knexTransaction<MobileSDKKeyTransaction>(
      "mobile_sdk_key_transactions"
    )
      .insert(
        claimKeyTransactions.slice(i, i + INSERT_CHUNK_SIZE),
        "*" // need this for postgres to return the added result
      )
      .onConflict([
        "wallet_id",
        "transaction_type",
        "transaction_hash",
        "direction",
      ])
      .merge();
  }

  // we should also call _createClientAppsFromReceipts here to create the MobileSDKClientApp objects
  // but we do that for all txns (including the ones just created above) in _createAllOtherKeyTransactions already
  // so would just be redundant to do it here also

  return claimKeyTransactions;
}

/** Creates "other" mobile_sdk_key_transactions, excluding all non-"other" key_transactions already created in
 * namedKeyTransactionsCreated. Note the block range must match the call to _createNamedKeyTransactions or
 * the categorization might not work properly
 *
 * @param namedKeyTransactionsCreated list of MobileSDKKeyTransaction already created by a call to
 * _createNamedKeyTransactions with the same block range
 * @param fromBlock
 * @param toBlock
 */
async function _createAllOtherKeyTransactions(
  knexTransaction: Knex.Transaction,
  namedKeyTransactionsCreated: MobileSDKKeyTransaction[],
  fromBlock: number,
  toBlock: number
) {
  // now that all current MSDKWallets are created, run the alchemy API to get all txns (one wallet at a time)
  // for any txns that dont exist yet, just save them as `other` (and re-fetch the datetime/gas/gas paid)
  const allWallets = await knexTransaction<MobileSDKWallet>(
    "mobile_sdk_wallets"
  ).select("id", "address");

  const walletAddressesByWalletId: {
    [key: number]: string;
  } = Object.fromEntries(allWallets.map((row) => [row.id, row.address]));

  const allAssetTransfersByAddress = await getAllAssetTransfersByAddress(
    allWallets.map((row) => row.address),
    fromBlock,
    toBlock
  );

  const allAssetTransfersByWalletId: {
    [key: number]: {
      is_incoming: boolean;
      result: AssetTransfersWithMetadataResult;
    }[];
  } = Object.fromEntries(
    allWallets.map((row) => [row.id, allAssetTransfersByAddress[row.address]])
  );

  // get txn receipts for the "other" asset transfers
  const allTransferReceiptsByTxnHash = await getTransactionReceiptsBatched([
    ...new Set(
      Object.values(allAssetTransfersByWalletId)
        .flat()
        .map((transfer) => transfer.result.hash)
    ),
  ]);

  // build helper object to use to filter out the named transactions that we created above
  // (this assumes the same block range was used for the named txns as was used above)
  let namedTransactionHashesByWalletId: { [key: number]: Set<string> } = {};
  namedKeyTransactionsCreated.forEach((txn) => {
    if (namedTransactionHashesByWalletId[txn.wallet_id] === undefined) {
      namedTransactionHashesByWalletId[txn.wallet_id] = new Set();
    }
    namedTransactionHashesByWalletId[txn.wallet_id]?.add(txn.transaction_hash);
  });

  const otherKeyTransactions: MobileSDKKeyTransaction[] = Object.entries(
    allAssetTransfersByWalletId
  )
    .map(([walletId, assetTransfers]) =>
      assetTransfers
        .filter(
          (assetTransfer) =>
            // filter out the transactions that were already saved as `token_faucet_claim` type above
            !(parseInt(walletId) in namedTransactionHashesByWalletId) ||
            !namedTransactionHashesByWalletId[parseInt(walletId)]!.has(
              assetTransfer.result.hash
            )
        )
        .map((assetTransfer) => ({
          wallet_id: parseInt(walletId),
          transaction_type: "other" as MobileSDKKeyTransactionType,
          transaction_hash: assetTransfer.result.hash,
          block_number: parseInt(assetTransfer.result.blockNum),
          datetime: new Date(assetTransfer.result.metadata.blockTimestamp),
          direction: (assetTransfer.is_incoming
            ? "incoming"
            : "outgoing") as MobileSDKKeyDirection,
          amount: undefined,
          gas_amount:
            allTransferReceiptsByTxnHash[
              assetTransfer.result.hash
            ]?.gasUsed.toString()!,
          gas_price:
            allTransferReceiptsByTxnHash[
              assetTransfer.result.hash
            ]?.effectiveGasPrice.toString()!,
          // if we can't find the receipts treat it as fatal, gas_paid_by_rna more important than some of the metadata above
          gas_paid_by_rna: _gasPaidByRna(
            allTransferReceiptsByTxnHash[assetTransfer.result.hash]!
          ),
        }))
    )
    .flat();

  for (let i = 0; i < otherKeyTransactions.length; i += INSERT_CHUNK_SIZE) {
    await knexTransaction<MobileSDKKeyTransaction>(
      "mobile_sdk_key_transactions"
    )
      .insert(
        otherKeyTransactions.slice(i, i + INSERT_CHUNK_SIZE),
        "*" // need this for postgres to return the added result
      )
      .onConflict([
        "wallet_id",
        "transaction_type",
        "transaction_hash",
        "direction",
      ])
      .merge();
  }

  await _createClientAppsFromReceipts(
    knexTransaction,
    walletAddressesByWalletId,
    allTransferReceiptsByTxnHash
  );
}

/** Helper function that extracts the client_id from RLYPaymasterPreCallValues event data for all
 * the wallets in `walletAddressesByWalletId` where it exists
 *
 * @param walletAddressesByWalletId
 * @param receiptsByTxnHash
 */
function _getClientIdByWalletIdDict(
  walletAddressesByWalletId: {
    [key: number]: string;
  },
  receiptsByTxnHash: { [key: string]: TransactionReceipt }
) {
  const walletIdsByWalletAddresses = Object.fromEntries(
    Object.entries(walletAddressesByWalletId).map(
      ([walletId, walletAddress]) => [walletAddress, parseInt(walletId)]
    )
  );

  // create {walletId: clientId} map by getting clientId from RLYPaymasterPreCallValues event data
  const clientIdByWalletId: { [key: number]: string } = {};

  Object.entries(receiptsByTxnHash).forEach(([txnHash, receipt]) => {
    const paymasterPreCallLog = receipt.logs.find(
      (log) =>
        log.topics.findIndex(
          (topic) => topic === EVENT_TOPIC_RLY_PAYMASTER_PRE_CALL_VALUES
        ) >= 0
    );

    if (!paymasterPreCallLog) {
      return; // e.g. RNA didn't pay for gas for this txn
    }

    paymasterPreCallLog.data;
    const decodedData = decodeLogWithABIAndEventName(
      RLYPaymasterABI as AbiItem[],
      "RLYPaymasterPreCallValues",
      paymasterPreCallLog.data,
      paymasterPreCallLog.topics
    );

    if (
      !decodedData ||
      !decodedData.from ||
      !decodedData.clientId ||
      !walletIdsByWalletAddresses[decodedData.from]
    ) {
      // some error decoding, ok to just skip for now and try again later
      console.error(`Error decoding log data for ${txnHash}`);
      return;
    }

    const walletId = walletIdsByWalletAddresses[decodedData.from];
    if (
      clientIdByWalletId[walletId!] &&
      clientIdByWalletId[walletId!] !== decodedData.clientId
    ) {
      // probably okay to treat this as fatal, don't think it should really ever happen so should investigate manually
      throw new Error(
        `Multiple clientIds found for walletId ${walletId}: ${
          clientIdByWalletId[walletId!]
        } and ${decodedData.clientId}`
      );
    }
    clientIdByWalletId[walletId!] = decodedData.clientId;
  });

  return clientIdByWalletId;
}

/** Creates MobileSDKClientApps (if they dont already exist) and updates MobileSDKWallet.client_app_id for all
 * the wallets in `walletAddressesByWalletId` (based on the event data in `receiptsByTxnHash`)
 *
 * @param walletAddressesByWalletId
 * @param receiptsByTxnHash
 * @returns
 */
async function _createClientAppsFromReceipts(
  knexTransaction: Knex.Transaction,
  walletAddressesByWalletId: {
    [key: number]: string;
  },
  receiptsByTxnHash: { [key: string]: TransactionReceipt }
) {
  const clientIdByWalletId = _getClientIdByWalletIdDict(
    walletAddressesByWalletId,
    receiptsByTxnHash
  );

  if (!clientIdByWalletId) {
    return; // no new clientIds found
  }

  // create or get all client_ids
  await knexTransaction<MobileSDKClientApp>("mobile_sdk_client_apps")
    .insert(
      [...new Set(Object.values(clientIdByWalletId))].map((clientId) => ({
        client_id: clientId,
      }))
    )
    .onConflict(["client_id"])
    .ignore();

  const dbResponse = await knexTransaction<MobileSDKClientApp>(
    "mobile_sdk_client_apps"
  ).select("*");
  const clientDbIdsByClientId: { [key: string]: number } = Object.fromEntries(
    dbResponse.map((row) => [row.client_id, row.id!])
  );

  // update client_app_id columns for wallets in clientIdByWalletId
  const caseIfClause = Object.entries(clientIdByWalletId)
    .map(
      ([walletId, clientId]) =>
        // e.g. "WHEN 123 THEN 1", used in raw DB update below
        `WHEN ${walletId} THEN ${clientDbIdsByClientId[clientId]!}`
    )
    .join(" ");

  await knexTransaction<MobileSDKWallet>("mobile_sdk_wallets")
    .update({
      client_app_id: knexTransaction.raw(
        `CASE id ${caseIfClause} ELSE NULL END`
      ),
    })
    .whereIn("id", Object.keys(clientIdByWalletId));
}
