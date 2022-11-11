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
  const dbResponse: {
    datetime: Date;
    sum: string;
    count: string;
    complete: boolean;
  }[] = await knex
    .select("datetime")
    .sum(knex.raw("balance / (10 ^ decimals)"))
    .as("balance")
    // heuristic to determine whether a day has partial data (would be more reliable to compare the actual
    // pool IDs but we rarely add pools anyway so count should be good enough)
    .count("balance")
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

  // drop any days that have partial data (i.e. they have `count` less than the previous days)
  // partial data appears as a decrease in TVL when it's really just a scraping error, so just don't show that day
  let maxCountSoFar = 0;
  for (let i = 0; i < dbResponse.length; i++) {
    const currentCount = parseInt(dbResponse[i]!.count);
    if (currentCount >= maxCountSoFar) {
      dbResponse[i]!.complete = true;
      maxCountSoFar = currentCount;
    } else {
      dbResponse[i]!.complete = false;
    }
  }

  return dbResponse
    .filter((record) => record.complete)
    .map((record) => {
      return {
        date: record.datetime.toISOString(),
        balance: parseInt(record.sum),
      };
    });
}
