import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("ethereum_token_contracts", function (table) {
    table.increments();
    // address is kind of case sensitive due to checksum so just store it as a string instead of bytes
    table.string("address", 40).notNullable().unique();
    table.string("display_name").notNullable();
    table.smallint("decimals").notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("ethereum_token_contracts");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
