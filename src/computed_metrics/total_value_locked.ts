import { getKnex } from "../database";
import { LiquidityCollateralToken } from "../knex-types/liquidity_collateral_token";
import { LiquidityPool } from "../knex-types/liquidity_pool";
import { idsFromModel } from "./utils";

const knex = getKnex();

export async function totalValueLockedInPools(
  collateralTokens: LiquidityCollateralToken[]
): Promise<string | number> {
  const relevantLiquidityPoolIds = knex<LiquidityPool>("liquidity_pools")
    .select("id")
    .whereIn("collateral_token_id", idsFromModel(collateralTokens));

  const dbResponse = await knex
    .from(
      knex
        .from("liquidity_pool_balances")
        .select(["liquidity_pool_id", "balance"])
        .rowNumber("row_number", function () {
          this.orderBy("datetime", "desc").partitionBy("liquidity_pool_id");
        })
        .as("data")
        .whereIn("liquidity_pool_id", relevantLiquidityPoolIds)
    )
    .sum("balance as total_balance")
    .where("row_number", "=", 1);

  return dbResponse[0]?.total_balance || 0;
}
