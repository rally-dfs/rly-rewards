export interface TrackedTokenAccount {
  id?: number;
  address: Uint8Array;
  owner_address?: Uint8Array;
  token_id: number;
  first_transaction_date: Date;
}
