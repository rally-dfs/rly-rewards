import { TrackedToken } from "../knex-types/tracked_token";
import { getKnex } from "../database";
import { accountIdsForTokens } from "./utils";

const knex = getKnex();

export async function totalTransactions(
  mintedTokens: TrackedToken[],
  opts?: { startDate?: Date }
) {
  const startDateFilter = opts?.startDate || new Date(0);

  const result = await knex("tracked_token_account_transactions")
    .count()
    .where("datetime", ">=", startDateFilter)
    .whereIn("tracked_token_account_id", accountIdsForTokens(mintedTokens));

  if (result.length < 1) {
    return -1;
  }

  return result[0]?.count;
}
