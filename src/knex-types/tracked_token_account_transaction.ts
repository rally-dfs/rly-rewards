export interface TrackedTokenAccountTransaction {
  id?: number;
  tracked_token_account_id: number;
  datetime: Date;
  transaction_hash: Uint8Array;
  transfer_in: boolean;
}
