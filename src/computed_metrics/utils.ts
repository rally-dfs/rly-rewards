import { TrackedToken } from "../knex-types/tracked_token";
import { getKnex } from "../database";

const knex = getKnex();

interface ModelWithId {
  id?: number;
}
export function idsFromModel(modelRecords: ModelWithId[]) {
  return modelRecords.map((t) => t.id).filter((id) => id != null) as number[];
}

export function accountIdsForTokens(mintedTokens: TrackedToken[]) {
  return knex
    .select("id")
    .from("tracked_token_accounts")
    .whereIn("token_id", idsFromModel(mintedTokens));
}
