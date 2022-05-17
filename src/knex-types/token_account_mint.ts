// this might end up kind of redundant with TBCTokenMint or the token B info in TBCAccounts if we add those there,
// but seemed like a better separation of concerns to have a dedicated table for this, otherwise we'd probably need
// bool configuration flags e.g. `should_get_tbc_tvl` `should_get_token_balances` to separate use cases
// (and seems cleaner to have this be a separate table than as a series of rows in TBCAccounts)
export interface TokenAccountMint {
  id?: number;
  mint_address: Uint8Array;
  decimals: number;
}
