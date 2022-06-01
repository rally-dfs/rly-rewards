import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("tracked_tokens", function (table) {
    table.increments();
    table.binary("mint_address", 32).notNullable().unique();
    table.smallint("decimals").notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("tracked_tokens");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
