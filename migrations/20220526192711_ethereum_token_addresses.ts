import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("ethereum_token_addresses", function (table) {
    table.increments();
    // address is kind of case sensitive due to checksum so just store it as a string
    table.string("address", 40).notNullable().unique();
    table.integer("contract_id").unsigned().notNullable();
    table.foreign("contract_id").references("ethereum_token_contracts.id");
    table.datetime("first_transaction_date").notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("ethereum_token_addresses");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
