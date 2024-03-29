import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable(
    "liquidity_collateral_tokens",
    function (table) {
      table
        .enu("chain", ["solana", "ethereum"], {
          useNative: true,
          enumName: "liquidity_collateral_token_chain",
        })
        .notNullable()
        .defaultTo("solana");
    }
  );
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema
      .alterTable("liquidity_collateral_tokens", function (table) {
        table.dropColumn("chain");
      })
      .raw("DROP TYPE liquidity_collateral_token_chain;");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
