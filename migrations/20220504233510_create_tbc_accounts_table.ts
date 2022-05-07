import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("tbc_accounts", function (table) {
    table.increments();
    table.binary("init_transaction_hash", 64).notNullable().unique();

    table.binary("token_a_account_address", 32).notNullable().unique();
    table.binary("token_a_account_owner_address", 32).notNullable();
    table.integer("token_a_mint_id").unsigned().notNullable();
    table.foreign("token_a_mint_id").references("token_mints.id");

    table.unique(["token_a_account_owner_address", "token_a_mint_id"]);
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
