import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable(
    "liquidity_collateral_tokens",
    function (table) {
      table.increments();
      table.string("mint_address").notNullable().unique();
      table.smallint("decimals").notNullable();
    }
  );
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("liquidity_collateral_tokens");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
