export interface TokenAccount {
  id?: number;
  address: Uint8Array;
  owner_address?: Uint8Array;
  mint_id: number;
  first_transaction_date: Date;
}
