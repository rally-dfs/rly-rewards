import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("token_accounts", function (table) {
    table.increments();
    table.binary("address", 32).notNullable().unique();
    // owner_address is ideally nonNullable but can be a bit flaky, kind of a nice to have anyway so non-fatal
    table.binary("owner_address", 32);
    table.integer("mint_id").unsigned().notNullable();
    table.foreign("mint_id").references("token_account_mints.id");
    table.datetime("first_transaction_date").notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("token_accounts");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
