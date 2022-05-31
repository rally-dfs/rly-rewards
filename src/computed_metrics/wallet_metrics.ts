import { getKnex } from "..//database";
import { TokenAccountMint } from "../knex-types/token_account_mint";
import { tokenDatabaseIds } from "./utils";

const knex = getKnex();

export async function totalWallets(
  mintedTokens: TokenAccountMint[],
  opts?: { startDate?: Date; removeEmptyWallets?: boolean }
) {
  const startDateFilter = opts?.startDate || new Date(0);

  const validAccounts = knex
    .select("token_account_id")
    .from("token_accounts")
    .whereIn("mint_id", tokenDatabaseIds(mintedTokens));

  const result = await knex("token_account_balances")
    .countDistinct("token_account_id")
    .where("datetime", ">=", startDateFilter)
    .whereIn("token_account_id", validAccounts)
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