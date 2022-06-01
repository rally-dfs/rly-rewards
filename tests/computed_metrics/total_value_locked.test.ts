import { getKnex } from "../../src/database";
import { LiquidityPool } from "../../src/knex-types/liquidity_pool";
import { LiquidityPoolBalance } from "../../src/knex-types/liquidity_pool_balance";
import { LiquidityCollateralToken } from "../../src/knex-types/liquidity_collateral_token";
import { createLiquidityCollateralToken } from "../factories";
import { totalValueLockedInPools } from "../../src/computed_metrics/total_value_locked";
import { expect } from "chai";

const knex = getKnex();

describe("#totalValueLockedInPools", () => {
  let collaterToken1: LiquidityCollateralToken;
  let collaterToken2: LiquidityCollateralToken;
  let pool1: LiquidityPool;
  let pool2: LiquidityPool;

  beforeEach(async () => {
    collaterToken1 = await createLiquidityCollateralToken("sRLY1");
    collaterToken2 = await createLiquidityCollateralToken("sRLY2");

    [pool1, pool2] = await knex<LiquidityPool>("liquidity_pools").insert(
      [
        {
          collateral_token_account: "fake_address1",
          collateral_token_account_owner: "fake_address",
          collateral_token_id: collaterToken1.id,
          init_transaction_hash: "some_hash1",
        },
        {
          collateral_token_account: "fake_address2",
          collateral_token_account_owner: "fake_address2",
          collateral_token_id: collaterToken2.id,
          init_transaction_hash: "some_hash2",
        },
      ],
      "*"
    );
  });
  it("returns the total sum of the most recent balance for all pools with the given collateral tokens", async () => {
    await knex<LiquidityPoolBalance>("liquidity_pool_balances").insert([
      {
        balance: 10,
        liquidity_pool_id: pool1.id,
        datetime: new Date("2022-05-20"),
      },
      {
        balance: 5,
        liquidity_pool_id: pool1.id,
        datetime: new Date("2022-05-19"),
      },
      {
        balance: 25,
        liquidity_pool_id: pool2.id,
        datetime: new Date("2022-05-19"),
      },
    ]);

    expect(
      await totalValueLockedInPools([collaterToken1, collaterToken2])
    ).to.equal("35");
  });

  it("can ignore balances for collateral tokens we don't care about ", async () => {
    await knex<LiquidityPoolBalance>("liquidity_pool_balances").insert([
      {
        balance: 10,
        liquidity_pool_id: pool1.id,
        datetime: new Date("2022-05-20"),
      },
      {
        balance: 5,
        liquidity_pool_id: pool1.id,
        datetime: new Date("2022-05-19"),
      },
      {
        balance: 25,
        liquidity_pool_id: pool2.id,
        datetime: new Date("2022-05-19"),
      },
    ]);

    expect(await totalValueLockedInPools([collaterToken1])).to.equal("10");
  });

  it("safely returns 0 if there are no pools for the specified collateral tokens", async () => {
    const collaterToken1 = await createLiquidityCollateralToken("sRLY1");

    expect(await totalValueLockedInPools([collaterToken1])).to.equal(0);
  });

  it("safely returns 0 if there are no recorded balances for any of the pools or tokens we are interested in", async () => {
    expect(
      await totalValueLockedInPools([collaterToken1, collaterToken2])
    ).to.equal(0);
  });
});
