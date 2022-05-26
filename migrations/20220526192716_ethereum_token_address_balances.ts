import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable(
    "ethereum_token_address_balances",
    function (table) {
      table.increments();
      table.integer("token_address_id").unsigned().notNullable();
      table
        .foreign("token_address_id")
        .references("ethereum_token_addresses.id");
      table.datetime("datetime").notNullable();
      // uint256 is too big for bigInteger
      table.string("balance").notNullable();

      table.unique(["token_address_id", "datetime"]);
    }
  );
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("ethereum_token_address_balances");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
