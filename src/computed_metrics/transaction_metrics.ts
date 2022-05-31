import { getKnex } from "../database";
import { TokenAccountMint } from "../knex-types/token_account_mint";
import { accountIdsForTokens } from "./utils";

const knex = getKnex();

export async function totalTransactions(
  mintedTokens: TokenAccountMint[],
  opts?: { startDate?: Date }
) {
  const startDateFilter = opts?.startDate || new Date(0);

  const result = await knex("token_account_transactions")
    .count()
    .where("datetime", ">=", startDateFilter)
    .whereIn("token_account_id", accountIdsForTokens(mintedTokens));

  if (result.length < 1) {
    return -1;
  }

  return result[0]?.count;
}
