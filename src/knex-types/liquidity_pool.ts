export interface LiquidityPool {
  id?: number;
  init_transaction_hash?: string;
  collateral_token_account: string;
  collateral_token_account_owner: string;
  collateral_token_id: number;
}
