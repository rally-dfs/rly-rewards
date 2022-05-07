import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("tbc_account_balances", function (table) {
    table.increments();
    table.integer("tbc_account_id").unsigned().notNullable();
    table.foreign("tbc_account_id").references("tbc_accounts.id");
    table.datetime("datetime").notNullable();
    table.bigInteger("balance").unsigned().notNullable();

    table.unique(["tbc_account_id", "datetime"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("tbc_account_balances");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
