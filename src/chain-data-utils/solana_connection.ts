// This file just handles triaging between alchemy and genesysgo since they're sometimes flaky (and also is useful
// for mocking the RPC for tests)

import { Connection, TransactionSignature } from "@solana/web3.js";

const alchemyConnection = new Connection(
  `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_ID}`,
  "finalized"
);

const genesysConnection = new Connection(
  "https://ssc-dao.genesysgo.net/",
  "finalized"
);

let currentConnection = alchemyConnection;

export async function getTransactionTriaged(signature: string) {
  try {
    return await currentConnection.getTransaction(signature, {
      commitment: "confirmed",
    });
  } catch (error) {
    console.log(
      `Error with ${
        currentConnection.rpcEndpoint.split("/")[2]
      }, trying other connection`
    );

    currentConnection =
      currentConnection === alchemyConnection
        ? genesysConnection
        : alchemyConnection;

    return await currentConnection.getTransaction(signature, {
      commitment: "confirmed",
    });
  }
}

export async function getTransactionsTriaged(
  signatures: TransactionSignature[]
) {
  try {
    return await currentConnection.getTransactions(signatures, "confirmed");
  } catch (error) {
    console.log(
      `Error with ${
        currentConnection.rpcEndpoint.split("/")[2]
      }, trying other connection`
    );

    currentConnection =
      currentConnection === alchemyConnection
        ? genesysConnection
        : alchemyConnection;

    return await currentConnection.getTransactions(signatures, "confirmed");
  }
}
