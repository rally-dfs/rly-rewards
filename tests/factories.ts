import { getKnex } from "../src/database";
import { TrackedTokenAccount } from "../src/knex-types/tracked_token_account";
import { LiquidityCollateralToken } from "../src/knex-types/liquidity_collateral_token";
import { TrackedToken } from "../src/knex-types/tracked_token";
import { RewardsDestinationWallet } from "../src/knex-types/rewards_destination_wallet";

const knex = getKnex();

export async function createTrackedToken(
  displayName: string,
  address: string,
  decimals?: number
) {
  const mintedTokens = await knex<TrackedToken>("tracked_tokens").insert(
    {
      mint_address: address,
      display_name: displayName,
      decimals: decimals || 8,
    },
    "*"
  );
  if (mintedTokens.length < 1) {
    throw new Error("Unable to initialize token mint");
  }

  return mintedTokens[0]!;
}

export async function createAccount(
  trackedToken: TrackedToken,
  date: Date,
  addressOverride?: string
): Promise<TrackedTokenAccount> {
  const fakeAddressSeed = Math.round(Math.random() * 100);
  const dbResponse = await knex<TrackedTokenAccount>(
    "tracked_token_accounts"
  ).insert(
    {
      address: addressOverride || fakeAddressSeed.toString(),
      owner_address: fakeAddressSeed.toString(),
      token_id: trackedToken.id,
      first_transaction_date: date,
    },
    "*"
  );
  if (dbResponse.length < 1) {
    throw new Error("Unable to create account");
  }
  return dbResponse[0]!;
}

export async function createLiquidityCollateralToken(displayName: string) {
  const fakeAddressSeed = Math.round(Math.random() * 100);
  const dbResponse = await knex<LiquidityCollateralToken>(
    "liquidity_collateral_tokens"
  ).insert(
    {
      display_name: displayName,
      decimals: 2,
      mint_address: fakeAddressSeed.toString(),
    },
    "*"
  );
  if (dbResponse.length < 1) {
    throw new Error("Unable to create liquidity collateral token");
  }
  return dbResponse[0]!;
}

export async function createRewardsDestinationWallet(
  destinationAddress: string,
  name: string,
  tokenSymbol: string
) {
  const dbResponse = await knex<RewardsDestinationWallet>(
    "rewards_destination_wallets"
  ).insert(
    {
      destination_address: destinationAddress,
      name: name,
      token_symbol: tokenSymbol,
      icon_url: undefined,
      website_url: `https://example.com/${tokenSymbol}_website`,
      display_blockchain: "Solana",
      explorer_url: `https://example.com/${tokenSymbol}_explorer`,
    },
    "*"
  );
  if (dbResponse.length < 1) {
    throw new Error("Unable to create liquidity collateral token");
  }
  return dbResponse[0]!;
}
