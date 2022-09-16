import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable(
    "rewards_destination_wallets",
    function (table) {
      table.increments();
      table.string("destination_address").notNullable().unique();
      table.string("name").notNullable().unique();
      table.string("token_symbol").notNullable();
    }
  );
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("rewards_destination_wallets");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
