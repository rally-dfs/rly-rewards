import { TrackedToken } from "../knex-types/tracked_token";
import { getKnex } from "../database";

const knex = getKnex();

export function tokenDatabaseIds(mintedTokens: TrackedToken[]) {
  return mintedTokens.map((t) => t.id).filter((id) => id != null) as number[];
}

export function accountIdsForTokens(mintedTokens: TrackedToken[]) {
  return knex
    .select("id")
    .from("tracked_token_accounts")
    .whereIn("token_id", tokenDatabaseIds(mintedTokens));
}
