export interface LiquidityPoolBalance {
  id?: number;
  liquidity_pool_id: number;
  datetime: Date;
  // This is a `numeric` type in psql, but because eth u256 balances can overflow typescript's `number`, we use
  // `string` here instead (if needed, the user of this should use the chain appropriate BN library to convert to a
  // number)
  balance: string;
}
