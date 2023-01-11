// This file just handles triaging between alchemy and genesysgo since they're sometimes flaky (and also is useful
// for mocking the RPC for tests)

import { Connection, TransactionSignature } from "@solana/web3.js";

const alchemyConnection = new Connection(
  `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_ID}`,
  "finalized"
);

const genesysConnection = new Connection(
  `https://cold-twilight-fog.solana-mainnet.discover.quiknode.pro/${process.env.QUICKNODE_SOLANA_ID}/`,
  "finalized"
);

let currentConnection = alchemyConnection;

export function switchConnection() {
  currentConnection =
    currentConnection === alchemyConnection
      ? genesysConnection
      : alchemyConnection;
}

export async function getTransactionTriaged(signature: string) {
  try {
    const transaction = await currentConnection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction) {
      throw new Error(); // sometimes `null` gets returned without an error, treat that as a retry
    }
    return transaction;
  } catch (error) {
    console.log(
      `Error with ${
        currentConnection.rpcEndpoint.split("/")[2]
      }, trying other connection. Error: ${error}`
    );

    switchConnection();

    return await currentConnection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  }
}

export async function getTransactionsTriaged(
  signatures: TransactionSignature[]
) {
  try {
    const transactions = await currentConnection.getTransactions(signatures, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!transactions) {
      throw new Error(); // sometimes `null` gets returned without an error, treat that as a retry
    }
    return transactions;
  } catch (error) {
    console.log(
      `Error with ${
        currentConnection.rpcEndpoint.split("/")[2]
      }, trying other connection. Error: ${error}`
    );

    switchConnection();

    return await currentConnection.getTransactions(signatures, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  }
}
