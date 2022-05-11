import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("token_account_balances", function (table) {
    table.increments();
    table.integer("token_account_id").unsigned().notNullable();
    table.foreign("token_account_id").references("token_accounts.id");
    table.datetime("datetime").notNullable();
    table.bigInteger("approximate_minimum_balance").unsigned().notNullable();

    table.unique(["token_account_id", "datetime"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("token_account_balances");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
