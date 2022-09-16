import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema
    .alterTable("tracked_token_account_balances", function (table) {
      table.index("datetime");
    })
    .alterTable("tracked_token_account_balance_changes", function (table) {
      table.index("datetime");
    });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema
      .alterTable("tracked_token_account_balances", function (table) {
        table.dropIndex("datetime");
      })
      .alterTable("tracked_token_account_balance_changes", function (table) {
        table.dropIndex("datetime");
      });
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
