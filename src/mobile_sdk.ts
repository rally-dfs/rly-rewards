import { getKnex } from "./database";
import { AbiItem } from "web3-utils";
import { EventData } from "web3-eth-contract";
import { TransactionReceipt } from "web3-core";

import { MobileSDKWallet } from "./knex-types/mobile_sdk_wallet";
import {
  MobileSDKKeyDirection,
  MobileSDKKeyTransaction,
} from "./knex-types/mobile_sdk_key_transaction";

import TokenFaucetABI from "./chain-data-utils/abis/token_faucet.json";

import {
  getEventsTransactionReceiptsAndBlocksFromContracts,
  getTransactionReceiptsBatched,
} from "./chain-data-utils/polygon";
import { getAllAssetTransfersByAddress } from "./chain-data-utils/alchemy";

import { AssetTransfersWithMetadataResult } from "alchemy-sdk";
import { MobileSDKKeyTransactionType } from "./knex-types/mobile_sdk_key_transaction";
import { BlockTransactionString } from "web3-eth";

// from testing, there's a ~10K row insert limit, split the inserts into chunks in case there's too many (probably
// would mostly only happen with transactions)
const INSERT_CHUNK_SIZE = 10000;

export async function getMobileSDKTransactions(
  toBlock: number,
  fromBlock?: number
) {
  const knex = getKnex();

  const contractsAndABIs = {
    // TODO: maybe dont really need to fetch paymaster events here, can just see whether topics[0]
    // for the paymaster event exists in transactionReceipts.logs
    // (e.g. 0x8c7dc6f54401600ae78b31aec3dec125cfa5b7bcbf4ff3cbc5bfd818ba082b49 is SampleRecipientPostCall)
    // "0x327BBd6BAc3236BCAcDE0D0f4FCD08b3eDfFbc06": PaymasterABI as AbiItem[],
    // "0xD934Ac8fB32336C5a2b51dF6a97432C4De0594F3": TokenFaucetABI as AbiItem[],
    "0xe7C3BD692C77Ec0C0bde523455B9D142c49720fF": TokenFaucetABI as AbiItem[],
  };

  if (fromBlock === undefined) {
    const dbResponse = await knex<MobileSDKKeyTransaction>(
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

  const { events, transactions, receipts, blocks } =
    await getEventsTransactionReceiptsAndBlocksFromContracts(
      contractsAndABIs,
      fromBlock,
      toBlock
    );

  console.log(`events ${JSON.stringify(events)}`);
  console.log(`=============`);
  console.log(`transactions ${JSON.stringify(transactions)}`);
  console.log(`=============`);
  console.log(`receipts ${JSON.stringify(receipts)}`);
  console.log(`=============`);
  console.log(`blocks ${JSON.stringify(blocks)}`);

  const namedKeyTransactionsCreated: MobileSDKKeyTransaction[] =
    await _createNamedKeyTransactions(events, blocks, receipts);

  await _createAllOtherKeyTransactions(
    namedKeyTransactionsCreated,
    fromBlock,
    toBlock
  );

  // TODO: fill out wallet.clientAppId attribution based on paymaster events
}

async function _createNamedKeyTransactions(
  events: EventData[],
  blocks: { [key: number]: BlockTransactionString },
  receipts: { [key: string]: TransactionReceipt }
) {
  const knex = getKnex();

  // iterate through all events, pick out the ones that match transaction_types we care about
  // e.g. {"TokenFaucet.Claim": MobileSDKKeyTransactionType.token_faucet_claim}
  // TODO: should make this generic and work for multiple events once we have them, kind of placeholder for now
  const claimEvents = events.filter(
    (event) =>
      event.address === "0xe7C3BD692C77Ec0C0bde523455B9D142c49720fF" &&
      event.event === "Claim"
  );

  const walletAddresses = claimEvents.map((event) => event.returnValues.sender);

  // create or get the MSDKWallet.id wallet_id
  const walletIdsByAddress: { [key: string]: number } = {};

  for (let i = 0; i < walletAddresses.length; i += INSERT_CHUNK_SIZE) {
    const walletResults = await knex<MobileSDKWallet>("mobile_sdk_wallets")
      .insert(
        walletAddresses.slice(i, i + INSERT_CHUNK_SIZE).map((address) => ({
          // TODO: need to also handle saving client_app but we can do that later (or in a different function)
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

  console.log(`inserted walletResults ${JSON.stringify(walletIdsByAddress)}`);

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
      // TODO: test that this handles direct calls to TokenFaucet.claim without using paymaster
      // TODO: placeholder, need to look up event either in receipt.logs or from `events`, probably easier once the
      // final contract is live
      gas_paid_by_rna: true,
    })
  );

  console.log(`claim key transactions ${JSON.stringify(claimKeyTransactions)}`);

  for (let i = 0; i < claimKeyTransactions.length; i += INSERT_CHUNK_SIZE) {
    await knex<MobileSDKKeyTransaction>("mobile_sdk_key_transactions")
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
  return claimKeyTransactions;
}

async function _createAllOtherKeyTransactions(
  namedKeyTransactionsCreated: MobileSDKKeyTransaction[],
  fromBlock: number,
  toBlock: number
) {
  const knex = getKnex();

  // now that all current MSDKWallets are created, run the alchemy API to get all txns (one wallet at a time)
  // for any txns that dont exist yet, just save them as `other` (and re-fetch the datetime/gas/gas paid)
  const allWallets = await knex<MobileSDKWallet>("mobile_sdk_wallets").select(
    "id",
    "address"
  );

  const walletAddressesByWalletId: {
    [key: number]: string;
  } = Object.fromEntries(allWallets.map((row) => [row.id, row.address]));

  const allAssetTransfersByAddress = await getAllAssetTransfersByAddress(
    allWallets.map((row) => row.address),
    fromBlock,
    toBlock
  );

  const allAssetTransfersByWalletId: {
    [key: number]: AssetTransfersWithMetadataResult[];
  } = Object.fromEntries(
    allWallets.map((row) => [row.id, allAssetTransfersByAddress[row.address]])
  );

  // get txn receipts for the "other" asset transfers
  const allAssetTransferReceipts = await getTransactionReceiptsBatched([
    ...new Set(
      Object.values(allAssetTransfersByWalletId)
        .flat()
        .map((transfer) => transfer.hash)
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
              assetTransfer.hash
            )
        )
        .map((assetTransfer) => ({
          wallet_id: parseInt(walletId),
          transaction_type: "other" as MobileSDKKeyTransactionType,
          transaction_hash: assetTransfer.hash,
          block_number: parseInt(assetTransfer.blockNum),
          datetime: new Date(assetTransfer.metadata.blockTimestamp),
          direction: (assetTransfer.to &&
          assetTransfer.to.toLowerCase() ===
            walletAddressesByWalletId[parseInt(walletId)]?.toLowerCase()
            ? "incoming"
            : assetTransfer.from &&
              assetTransfer.from.toLowerCase() ===
                walletAddressesByWalletId[parseInt(walletId)]?.toLowerCase()
            ? "outgoing"
            : "neither") as MobileSDKKeyDirection,
          amount: undefined,
          gas_amount:
            allAssetTransferReceipts[assetTransfer.hash]?.gasUsed.toString()!,
          gas_price:
            allAssetTransferReceipts[
              assetTransfer.hash
            ]?.effectiveGasPrice.toString()!,
          // TODO: test that this handles direct calls to TokenFaucet.claim without using paymaster
          // TODO: placeholder, need to look up event either in receipt.logs or from `events`, probably easier once the
          // final contract is live
          gas_paid_by_rna: true,
        }))
    )
    .flat();

  console.log(`other key txns ${JSON.stringify(otherKeyTransactions)}`);

  for (let i = 0; i < otherKeyTransactions.length; i += INSERT_CHUNK_SIZE) {
    await knex<MobileSDKKeyTransaction>("mobile_sdk_key_transactions")
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
}
