export interface TBCAccount {
  id?: number;
  init_transaction_hash: Uint8Array;
  token_a_account_address: Uint8Array;
  token_a_account_owner_address: Uint8Array;
  token_a_mint_id: number;
}