import { getKnex } from "../database";
import { LiquidityCollateralToken } from "../knex-types/liquidity_collateral_token";
import { LiquidityPool } from "../knex-types/liquidity_pool";
import { idsFromModel } from "./utils";

const knex = getKnex();

function relevantLiquidityPoolIds(
  collateralTokens: LiquidityCollateralToken[]
) {
  return knex<LiquidityPool>("liquidity_pools")
    .select("id")
    .whereIn("collateral_token_id", idsFromModel(collateralTokens));
}

export async function totalValueLockedInPools(
  collateralTokens: LiquidityCollateralToken[]
): Promise<string | number> {
  const dbResponse = await knex
    .from(
      knex
        .from("liquidity_pool_balances")
        .select(["liquidity_pool_id", "balance"])
        .rowNumber("row_number", function () {
          this.orderBy("datetime", "desc").partitionBy("liquidity_pool_id");
        })
        .as("data")
        .whereIn(
          "liquidity_pool_id",
          relevantLiquidityPoolIds(collateralTokens)
        )
    )
    .sum("balance as total_balance")
    .where("row_number", "=", 1);

  return dbResponse[0]?.total_balance || 0;
}

export async function valueLockedByDay(
  collateralTokens: LiquidityCollateralToken[]
) {
  const dbResponse: { datetime: Date; sum: string }[] = await knex
    .from("liquidity_pool_balances")
    .select("datetime")
    .sum("balance")
    .whereIn("liquidity_pool_id", relevantLiquidityPoolIds(collateralTokens))
    .groupBy("datetime")
    .orderBy("datetime");

  return dbResponse.map((record) => {
    return {
      date: record.datetime.toISOString(),
      balance: parseInt(record.sum),
    };
  });
}
