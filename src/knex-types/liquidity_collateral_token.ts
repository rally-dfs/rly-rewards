export interface LiquidityCollateralToken {
  id?: number;
  // mint_address is globally UNIQUE but we can replace that with UNIQUE(mint_address, chain) in the future if we need
  // e.g. to handle the same token address across multiple evm chains
  mint_address: string;
  display_name: string;
  decimals: number;
  chain: LiquidityCollateralTokenChain;
}

export type LiquidityCollateralTokenChain = "solana" | "ethereum";
