export interface EthereumTokenAddressTransaction {
  id?: number;
  token_address_id: number;
  datetime: Date;
  transaction_hash: Uint8Array;
  transfer_in: boolean;
}
