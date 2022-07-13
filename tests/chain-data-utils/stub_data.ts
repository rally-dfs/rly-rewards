// copied structure from bitquery with values changed for readability
// (obviously these hashes aren't long enough to be real pubkeys but it's much more readable this way)
export const BQ_SOL_TRANSFERS_PAGE_ONE = {
  solana: {
    transfers: [
      {
        amount: 1_111_111_111, // note this is base units instead of decimals, unlike eth
        transferType: "transfer",
        transaction: {
          signature: "signature11111",
          success: true,
        },
        sender: {
          address: "ownerAAAAA",
          mintAccount: "tokenaccountAAAAA",
          type: "account",
        },
        receiver: {
          address: "ownerBBBBB",
          mintAccount: "tokenaccountBBBBB",
          type: "account",
        },
        block: {
          timestamp: {
            iso8601: "2022-06-01T00:01:00Z",
          },
        },
      },
      {
        amount: 2_222_222_222,
        transferType: "transfer",
        transaction: {
          signature: "signature22222",
          success: true,
        },
        sender: {
          address: "ownerCCCCC",
          mintAccount: "tokenaccountCCCCC",
          type: "account",
        },
        receiver: {
          address: "ownerAAAAA",
          mintAccount: "tokenaccountAAAAA",
          type: "account",
        },
        block: {
          timestamp: {
            iso8601: "2022-06-01T00:02:00Z",
          },
        },
      },
    ],
  },
};

export const BQ_SOL_TRANSFERS_PAGE_TWO = {
  solana: {
    transfers: [
      {
        amount: 3_333_333_333,
        transferType: "transfer",
        transaction: {
          signature: "signature33333",
          success: true,
        },
        sender: {
          address: "ownerBBBBB",
          mintAccount: "tokenaccountBBBBB",
          type: "account",
        },
        receiver: {
          address: "ownerAAAAA",
          mintAccount: "tokenaccountAAAAA",
          type: "account",
        },
        block: {
          timestamp: {
            iso8601: "2022-06-01T00:03:00Z",
          },
        },
      },
    ],
  },
};

// copied structure from bitquery with values changed for readability
// (obviously these hashes aren't long enough to be real pubkeys but it's much more readable this way)
// this is basically the same as BQ_SOL_TRANSFERS_FOO except that amount is a decimal instead of base units (bitquery
// is inconsistent between the two, so we match the responses here)
export const BQ_ETH_TRANSFERS_PAGE_ONE = {
  ethereum: {
    transfers: [
      {
        amount: 1.111_111_111_111, // note this is decimal instead of base units, unlike solana (and always to 12 decimals)
        sender: {
          address: "addressAAAAA",
        },
        receiver: {
          address: "addressBBBBB",
        },
        transaction: {
          hash: "signature11111",
        },
        block: {
          timestamp: {
            iso8601: "2022-06-01T00:01:00Z",
          },
        },
      },
      {
        amount: 2.222_222_222_222,
        sender: {
          address: "addressCCCCC",
        },
        receiver: {
          address: "addressAAAAA",
        },
        transaction: {
          hash: "signature22222",
        },
        block: {
          timestamp: {
            iso8601: "2022-06-01T00:02:00Z",
          },
        },
      },
    ],
  },
};

export const BQ_ETH_TRANSFERS_PAGE_TWO = {
  ethereum: {
    transfers: [
      {
        amount: 3.333_333_333_333,
        sender: {
          address: "addressBBBBB",
        },
        receiver: {
          address: "addressAAAAA",
        },
        transaction: {
          hash: "signature33333",
        },
        block: {
          timestamp: {
            iso8601: "2022-06-01T00:03:00Z",
          },
        },
      },
    ],
  },
};

// these owners match the above transactions' ordering and transfer amounts/balances are consistent
// there's a bunch of stuff in TransactionResponse we don't care about so just leave those out for readability
// (and suppress the ts error with `any`)
// txn signature11111, from ownerAAAAA -> ownerBBBBB for 1.111_111_111
export const SOLANA_GET_TRANSACTION_ONE: any = {
  transaction: { message: { accountKeys: [] } }, // don't need any content, just need the keys to avoid exception
  meta: {
    postTokenBalances: [
      {
        accountIndex: 0,
        mint: "tokenmint00000",
        owner: "ownerAAAAA",
        uiTokenAmount: {
          amount: "10000000000",
        },
      },
      {
        accountIndex: 1,
        mint: "tokenmint00000",
        owner: "ownerBBBBB",
        uiTokenAmount: {
          amount: "22111111111",
        },
      },
    ],
  },
};

// txn signature22222, from ownerCCCCC -> ownerAAAAA for 2.222_222_222
export const SOLANA_GET_TRANSACTION_TWO: any = {
  transaction: { message: { accountKeys: [] } }, // don't need any content, just need the keys to avoid exception
  meta: {
    postTokenBalances: [
      {
        accountIndex: 0,
        mint: "tokenmint00000",
        owner: "ownerCCCCC",
        uiTokenAmount: {
          amount: "30000000000",
        },
      },
      {
        accountIndex: 1,
        mint: "tokenmint00000",
        owner: "ownerAAAAA",
        uiTokenAmount: {
          amount: "12222222222",
        },
      },
    ],
  },
};

// txn signature33333, from ownerBBBBB -> ownerAAAAA for 3.333_333_333
export const SOLANA_GET_TRANSACTION_THREE: any = {
  transaction: { message: { accountKeys: [] } }, // don't need any content, just need the keys to avoid exception
  meta: {
    postTokenBalances: [
      {
        accountIndex: 0,
        mint: "tokenmint00000",
        owner: "ownerBBBBB",
        uiTokenAmount: {
          amount: "18777777778",
        },
      },
      {
        accountIndex: 1,
        mint: "tokenmint00000",
        owner: "ownerAAAAA",
        uiTokenAmount: {
          amount: "15555555555",
        },
      },
    ],
  },
};
