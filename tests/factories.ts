import { getKnex } from "../src/database";
import { TokenAccount } from "../src/knex-types/token_account";
import { TokenAccountMint } from "../src/knex-types/token_account_mint";

const knex = getKnex();

export async function createTrackedToken(
  displayName: string,
  address: Uint8Array
) {
  const mintedTokens = await knex<TokenAccountMint>(
    "token_account_mints"
  ).insert(
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
  mintedToken: TokenAccountMint,
  date: Date
): Promise<TokenAccount> {
  const fakeAddressSeed = Math.round(Math.random() * 100);
  const dbResponse = await knex<TokenAccount>("token_accounts").insert(
    {
      address: Uint8Array.from([fakeAddressSeed]),
      owner_address: Uint8Array.from([fakeAddressSeed]),
      mint_id: mintedToken.id,
      first_transaction_date: date,
    },
    "*"
  );
  if (dbResponse.length < 1) {
    throw new Error("Unable to create account");
  }
  return dbResponse[0];
}
