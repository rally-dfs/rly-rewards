import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable(
    "token_account_transactions",
    function (table) {
      table.increments();
      table.integer("token_account_id").unsigned().notNullable();
      table.foreign("token_account_id").references("token_accounts.id");
      table.datetime("datetime").notNullable();
      table.binary("transaction_hash", 64).notNullable();
      table.boolean("transfer_in").notNullable();

      // a transaction will have one row for incoming and one row for outgoing (with different token_account_ids),
      // so transaction_hash itself isn't globally unique
      table.unique(["token_account_id", "transaction_hash"]);
    }
  );
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("token_account_transactions");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
