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
) {
  const dbResponse = await knex
    .from(
      knex
        .select("liquidity_pool_id")
        .select(knex.raw("balance / (10 ^ decimals) as balance"))
        .rowNumber("row_number", function () {
          this.orderBy("datetime", "desc").partitionBy("liquidity_pool_id");
        })
        .as("data")
        .from("liquidity_pool_balances")
        .innerJoin(
          "liquidity_pools",
          "liquidity_pools.id",
          "liquidity_pool_balances.liquidity_pool_id"
        )
        .innerJoin(
          "liquidity_collateral_tokens",
          "liquidity_collateral_tokens.id",
          "liquidity_pools.collateral_token_id"
        )
        .whereIn(
          "liquidity_pool_id",
          relevantLiquidityPoolIds(collateralTokens)
        )
    )
    .sum("balance as total_balance")
    .where("row_number", "=", 1);

  return parseInt(dbResponse[0]?.total_balance) || 0;
}

export async function valueLockedByDay(
  collateralTokens: LiquidityCollateralToken[]
) {
  const dbResponse: { datetime: Date; sum: string }[] = await knex
    .select("datetime")
    .sum(knex.raw("balance / (10 ^ decimals)"))
    .as("balance")
    .from("liquidity_pool_balances")
    .innerJoin(
      "liquidity_pools",
      "liquidity_pools.id",
      "liquidity_pool_balances.liquidity_pool_id"
    )
    .innerJoin(
      "liquidity_collateral_tokens",
      "liquidity_collateral_tokens.id",
      "liquidity_pools.collateral_token_id"
    )
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
