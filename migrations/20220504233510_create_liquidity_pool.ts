import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("liquidity_pools", function (table) {
    table.increments();
    table.binary("init_transaction_hash", 64).unique();

    table.binary("collateral_token_account", 32).notNullable().unique();
    table.binary("collateral_token_account_owner", 32).notNullable();
    table.integer("collateral_token_id").unsigned().notNullable();
    table
      .foreign("collateral_token_id")
      .references("liquidity_collateral_tokens.id");

    table.unique(["collateral_token_account_owner", "collateral_token_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("liquidity_pools");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
