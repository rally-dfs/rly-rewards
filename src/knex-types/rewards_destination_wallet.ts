export interface RewardsDestinationWallet {
  id?: number;
  // this is only ethereum for now but in theory could be other chains in the future
  destination_address: string;
  name: string;
  token_symbol: string;
  icon_url?: string;
  website_url?: string;
  // this is just display metadata, i.e. NOT the chain of destination_address
  // (which is always eth for now)
  display_blockchain?: string;
  explorer_url?: string;
}
