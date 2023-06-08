import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("mobile_sdk_wallets", function (table) {
    table.increments();
    // client_app can be filled out any time after the wallet is initially created
    // (i.e. from Paymaster attribution), so allow it to be nullable
    table.integer("client_app_id").unsigned().nullable();
    table.foreign("client_app_id").references("mobile_sdk_client_apps.id");

    table.string("address").notNullable().unique();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("mobile_sdk_wallets");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
