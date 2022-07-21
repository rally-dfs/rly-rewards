import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("liquidity_pools", function (table) {
    table.string("collateral_token_account_owner").nullable().alter(); // make nullable for eth
    table.dropUnique(["collateral_token_account_owner", "collateral_token_id"]);
    table.unique([
      "collateral_token_account",
      "collateral_token_account_owner",
      "collateral_token_id",
    ]);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.alterTable("liquidity_pools", function (table) {
      table.string("collateral_token_account_owner").notNullable().alter();
      table.dropUnique([
        "collateral_token_account",
        "collateral_token_account_owner",
        "collateral_token_id",
      ]);
      table.unique(["collateral_token_account_owner", "collateral_token_id"]);
    });
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
