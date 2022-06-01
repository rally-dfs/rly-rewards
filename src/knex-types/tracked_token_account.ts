export interface TrackedTokenAccount {
  id?: number;
  address: string;
  owner_address?: string;
  token_id: number;
  first_transaction_date: Date;
}
