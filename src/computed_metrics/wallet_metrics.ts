import { TrackedToken } from "../knex-types/tracked_token";
import { getKnex } from "..//database";
import { accountIdsForTokens } from "./utils";
import { format } from "date-fns";

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

  return parseInt(result[0]?.count);
}

export async function totalWalletsByDay(
  trackedTokens: TrackedToken[],
  opts?: { startDate?: Date; removeEmptyWallets?: boolean }
) {
  const startDateFilter = opts?.startDate || new Date(0);

  const dbResponse: { datetime: Date; count: string }[] = await knex
    .from("tracked_token_account_balances")
    .select("datetime")
    // count(*) is the same as countDistinct("tracked_token_account_id") as long as we have the
    // unique(tracked_token_account_id, datetime) index, and it's a much faster query
    .count("*")
    .where("datetime", ">=", startDateFilter)
    .whereIn("tracked_token_account_id", accountIdsForTokens(trackedTokens))
    .modify((query) => {
      if (opts?.removeEmptyWallets) {
        query.where("approximate_minimum_balance", ">", 0);
      }
    })
    .groupBy("datetime")
    .orderBy("datetime");

  return dbResponse.map((record) => ({
    date: record.datetime.toISOString(),
    walletCount: parseInt(record.count),
  }));
}

export async function totalActiveWalletsByDay(trackedTokens: TrackedToken[]) {
  const startDateFilter = new Date(0);

  const dbResponse: { transaction_date: Date; count: string }[] = await knex
    .with(
      "clean_data",
      knex
        .from("tracked_token_account_transactions")
        .select(
          knex.raw("(datetime AT TIME ZONE 'utc')::date as transaction_date")
        )
        .select("tracked_token_account_id")
        .where("datetime", ">=", startDateFilter)
        .whereIn("tracked_token_account_id", accountIdsForTokens(trackedTokens))
        .where("transfer_in", false)
    )
    .from("clean_data")
    .select("transaction_date")
    .countDistinct("tracked_token_account_id")
    .groupBy("transaction_date")
    .orderBy("transaction_date");

  return dbResponse.map((record) => ({
    date: format(record.transaction_date, "yyyy-MM-dd"),
    activeWalletCount: parseInt(record.count),
  }));
}

export async function totalActiveWallets(trackedTokens: TrackedToken[]) {
  const startDateFilter = new Date(0);
  const dbResponse: { count: string }[] = await knex
    .from("tracked_token_account_transactions")
    .countDistinct("tracked_token_account_id")
    .where("datetime", ">=", startDateFilter)
    .whereIn("tracked_token_account_id", accountIdsForTokens(trackedTokens))
    .where("transfer_in", false);

  return parseInt(dbResponse[0]?.count!);
}
