import { TrackedToken } from "../knex-types/tracked_token";
import { getKnex } from "..//database";
import { accountIdsForTokens } from "./utils";

const knex = getKnex();

export async function totalWallets(
  mintedTokens: TrackedToken[],
  opts?: { startDate?: Date; removeEmptyWallets?: boolean }
) {
  const startDateFilter = opts?.startDate || new Date(0);

  const result = await knex("tracked_token_account_balances")
    .countDistinct("tracked_token_account_id")
    .where("datetime", ">=", startDateFilter)
    .whereIn("tracked_token_account_id", accountIdsForTokens(mintedTokens))
    .modify((query) => {
      if (opts?.removeEmptyWallets) {
        query.where("approximate_minimum_balance", ">", 0);
      }
    });

  if (result.length < 1) {
    return -1;
  }

  return result[0]?.count;
}
