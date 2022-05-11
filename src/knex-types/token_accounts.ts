// this might end up kind of redundant with TBCTokenMint or the token B info in TBCAccounts if we add those there,
// but seemed like a better separation of concerns to have a dedicated table for this, otherwise we'd probably need
// bool configuration flags e.g. `should_get_tbc_tvl` `should_get_token_balances` to separate use cases
// (and seems cleaner to have this be a separate table than as a series of rows in TBCAccounts)
export interface TokenAccountMint {
  id?: number;
  mint_address: Uint8Array;
  decimals: number;
}

export interface TokenAccount {
  id?: number;
  address: Uint8Array;
  owner_address?: Uint8Array;
  mint_id: number;
  first_transaction_date: Date;
}

export interface TokenAccountBalance {
  id?: number;
  token_account_id: number;
  datetime: Date;
  // we don't have good/efficient enough data to get a real balance here, so this is just a best guess to answer
  // "does this account have > 0 balance". solana.fm doens't have decimal precision and bitquery only has a balance
  // change and not a real balance (i.e. it's probably too efficient to try and piece it together or call on chain
  // data for every TokenAccount to get a real balance, though we can certainly try in the future if we need more
  // precision)
  // note since bitquery only has balance change, we only store the positive changes here and ignore negative ones
  // (if we start trying to piece together whether a negative change caused the account to go to 0, might as well just
  // try to get the real balance)
  approximate_minimum_balance: number;
}

export interface TokenAccountTransaction {
  id?: number;
  token_account_id: number;
  datetime: Date;
  transaction_hash: Uint8Array;
  transfer_in: boolean;
}
