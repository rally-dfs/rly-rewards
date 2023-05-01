export interface MobileSDKKeyTransaction {
  id?: number;
  wallet_id: number;
  transaction_type: MobileSDKKeyTransactionType;
  transaction_hash: string;
  block_number: number;
  datetime: Date;
  direction: MobileSDKKeyDirection;
  // These are `numeric` type in psql, but because eth u256 balances can overflow typescript's `number`, we use
  // `string` here instead (if needed, the user of this should use the chain appropriate BN library to convert to a
  // number)
  amount?: string;
  gas_amount: string;
  gas_price: string;
  gas_paid_by_rna: boolean;
}

export type MobileSDKKeyTransactionType = "token_faucet_claim" | "other";
export type MobileSDKKeyDirection = "incoming" | "outgoing" | "neither";
