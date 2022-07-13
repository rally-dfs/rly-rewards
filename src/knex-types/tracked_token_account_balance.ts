export interface TrackedTokenAccountBalance {
  id?: number;
  tracked_token_account_id: number;
  datetime: Date;
  // Bitquery only has a balance change and not a real balance, so we call the on chain (and if that fails for a txn,
  // we try to piece it together from bitquery's balance deltas). This should be accurate 99%+ of the time, but will be
  // an approximation if the on chain call fails
  // This is a `numeric` type in psql, but because eth u256 balances can overflow typescript's `number`, we use
  // `string` here instead (if needed, the user of this should use the chain appropriate BN library to convert to a
  // number)
  approximate_minimum_balance: string;
}
