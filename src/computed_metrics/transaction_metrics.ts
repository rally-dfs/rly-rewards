import { TrackedToken } from "../knex-types/tracked_token";
import { getKnex } from "../database";
import { accountIdsForTokens } from "./utils";

const knex = getKnex();

export async function totalTransactions(
  mintedTokens: TrackedToken[],
  opts?: { startDate?: Date }
) {
  const byDayCount = await transactionsByDay(mintedTokens, opts);

  return byDayCount.reduce((total, record) => {
    return total + record.transactionCount;
  }, 0);
}

export async function transactionsByDay(
  trackedTokens: TrackedToken[],
  opts?: { startDate?: Date }
) {
  const startDateFilter = opts?.startDate || new Date(0);

  const dbResponse: { datetime: Date; count: string }[] = await knex
    .from("tracked_token_account_transactions")
    .select("datetime")
    .count()
    .where("datetime", ">=", startDateFilter)
    .whereIn("tracked_token_account_id", accountIdsForTokens(trackedTokens))
    .groupBy("datetime")
    .orderBy("datetime");

  return dbResponse.map((record) => ({
    date: record.datetime.toISOString(),
    transactionCount: parseInt(record.count),
  }));
}
