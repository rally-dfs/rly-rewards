export interface TokenAccountTransaction {
  id?: number;
  token_account_id: number;
  datetime: Date;
  transaction_hash: Uint8Array;
  transfer_in: boolean;
}
