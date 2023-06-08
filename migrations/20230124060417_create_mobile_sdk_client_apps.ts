import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("mobile_sdk_client_apps", function (table) {
    table.increments();
    table.string("client_id").notNullable().unique(); // TODO: using string for now but maybe int is better
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("mobile_sdk_client_apps");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
