export interface LiquidityPool {
  id?: number;
  init_transaction_hash?: Uint8Array;
  collateral_token_account: Uint8Array;
  collateral_token_account_owner: Uint8Array;
  collateral_token_id: number;
}
