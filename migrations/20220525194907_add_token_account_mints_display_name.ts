import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("tracked_tokens", function (table) {
    table.string("display_name").notNullable().defaultTo("N/A");
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.alterTable("tracked_tokens", function (table) {
      table.dropColumn("display_name");
    });
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
