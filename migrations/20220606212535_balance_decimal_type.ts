import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema
    .alterTable("tracked_token_account_balances", function (table) {
      // null for unlimited precision and 0 for 0 scale (store as whole numbers to match on chain values, not as
      // post-division decimals)
      table.decimal("approximate_minimum_balance", null, 0).alter();
    })
    .alterTable("tracked_token_account_balance_changes", function (table) {
      table.decimal("approximate_minimum_balance", null, 0).alter();
    });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema
      .alterTable("tracked_token_account_balances", function (table) {
        table.bigInteger("approximate_minimum_balance").alter();
      })
      .alterTable("tracked_token_account_balance_changes", function (table) {
        table.bigInteger("approximate_minimum_balance").alter();
      });
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
