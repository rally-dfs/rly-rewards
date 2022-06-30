import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable(
    "tracked_token_account_transactions",
    function (table) {
      table.datetime("transaction_datetime");
    }
  );
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.alterTable(
      "tracked_token_account_transactions",
      function (table) {
        table.dropColumn("transaction_datetime");
      }
    );
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
