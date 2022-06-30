export interface TrackedTokenAccountTransaction {
  id?: number;
  tracked_token_account_id: number;
  datetime: Date;
  transaction_datetime?: Date;
  transaction_hash: string;
  transfer_in: boolean;
}
