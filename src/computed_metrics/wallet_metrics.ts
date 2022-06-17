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

export async function totalWalletsByDay(trackedTokens: TrackedToken[]) {
  const startDateFilter = new Date(0);

  const dbResponse: { datetime: Date; count: string }[] = await knex
    .from("tracked_token_account_balances")
    .select("datetime")
    .countDistinct("tracked_token_account_id")
    .where("datetime", ">=", startDateFilter)
    .whereIn("tracked_token_account_id", accountIdsForTokens(trackedTokens))
    .groupBy("datetime")
    .orderBy("datetime");

  return dbResponse.map((record) => ({
    date: record.datetime.toISOString(),
    walletCount: parseInt(record.count),
  }));
}

export async function totalActiveWalletsByDay(trackedTokens: TrackedToken[]) {
  const startDateFilter = new Date(0);

  const dbResponse: { datetime: Date; count: string }[] = await knex
    .from("tracked_token_account_transactions")
    .select(knex.raw("datetime::date"))
    .countDistinct("tracked_token_account_id")
    .where("datetime", ">=", startDateFilter)
    .whereIn("tracked_token_account_id", accountIdsForTokens(trackedTokens))
    .where("transfer_in", false)
    .groupBy(knex.raw("datetime::date"))
    .orderBy("datetime");

  return dbResponse.map((record) => ({
    date: record.datetime.toISOString(),
    activeWalletCount: parseInt(record.count),
  }));
}
