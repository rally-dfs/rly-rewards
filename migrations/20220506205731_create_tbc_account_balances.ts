import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("liquidity_pool_balances", function (table) {
    table.increments();
    table.integer("liquidity_pool_id").unsigned().notNullable();
    table.foreign("liquidity_pool_id").references("liquidity_pools.id");
    table.datetime("datetime").notNullable();
    table.bigInteger("balance").unsigned().notNullable();

    table.unique(["liquidity_pool_id", "datetime"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("liquidity_pool_balances");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
