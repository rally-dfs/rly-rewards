import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("liquidity_pool_balances", function (table) {
    // null for unlimited precision and 0 for 0 scale (store as whole numbers to match on chain values, not as
    // post-division decimals)
    table.decimal("balance", null, 0).alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.alterTable("liquidity_pool_balances", function (table) {
      table.bigInteger("balance").alter();
    });
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
