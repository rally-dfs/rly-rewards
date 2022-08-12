export interface RewardsDestinationWallet {
  id?: number;
  // this is only ethereum for now but in theory could be other chains in the future
  destination_address: string;
  name: string;
  token_symbol: string;
}
