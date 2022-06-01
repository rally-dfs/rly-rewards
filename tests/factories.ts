import { getKnex } from "../src/database";
import { TrackedTokenAccount } from "../src/knex-types/tracked_token_account";
import { TrackedToken } from "../src/knex-types/tracked_token";

const knex = getKnex();

export async function createTrackedToken(displayName: string, address: string) {
  const mintedTokens = await knex<TrackedToken>("tracked_tokens").insert(
    {
      mint_address: address,
      display_name: displayName,
      decimals: 8,
    },
    "*"
  );
  if (mintedTokens.length < 1) {
    throw new Error("Unable to initialize token mint");
  }

  return mintedTokens[0];
}

export async function createAccount(
  trackedToken: TrackedToken,
  date: Date
): Promise<TrackedTokenAccount> {
  const fakeAddressSeed = Math.round(Math.random() * 100);
  const dbResponse = await knex<TrackedTokenAccount>(
    "tracked_token_accounts"
  ).insert(
    {
      address: fakeAddressSeed.toString(),
      owner_address: fakeAddressSeed.toString(),
      token_id: trackedToken.id,
      first_transaction_date: date,
    },
    "*"
  );
  if (dbResponse.length < 1) {
    throw new Error("Unable to create account");
  }
  return dbResponse[0];
}
