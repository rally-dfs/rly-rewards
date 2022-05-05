import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("tbc_accounts", function (table) {
    table.increments();
    table.binary("token_a_account_address", 32);
    table.unique(["token_a_account_address"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("tbc_accounts");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
