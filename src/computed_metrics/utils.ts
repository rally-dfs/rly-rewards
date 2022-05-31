import { getKnex } from "../database";
import { TokenAccountMint } from "../knex-types/token_account_mint";

const knex = getKnex();

export function tokenDatabaseIds(mintedTokens: TokenAccountMint[]) {
  return mintedTokens.map((t) => t.id).filter((id) => id != null) as number[];
}

export function accountIdsForTokens(mintedTokens: TokenAccountMint[]) {
  return knex
    .select("id")
    .from("token_accounts")
    .whereIn("mint_id", tokenDatabaseIds(mintedTokens));
}
