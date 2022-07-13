export interface TrackedTokenAccountTransaction {
  id?: number;
  tracked_token_account_id: number;
  datetime: Date;
  transaction_datetime?: Date;
  transaction_hash: string;
  // This is a `numeric` type in psql, but because eth u256 balances can overflow typescript's `number`, we use
  // `string` here instead (if needed, the user of this should use the chain appropriate BN library to convert to a
  // number)
  amount?: string;
  transfer_in: boolean;
}
