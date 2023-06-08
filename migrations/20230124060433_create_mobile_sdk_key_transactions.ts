import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable(
    "mobile_sdk_key_transactions",
    function (table) {
      table.increments();
      table.integer("wallet_id").unsigned().notNullable();
      table.foreign("wallet_id").references("mobile_sdk_wallets.id");
      table
        .enu("transaction_type", ["token_faucet_claim", "other"], {
          useNative: true,
          enumName: "mobile_sdk_key_transaction_type",
        })
        .notNullable()
        .defaultTo("other");
      // note txn hash isn't globally unique - see below
      table.string("transaction_hash").notNullable();
      table.integer("block_number").unsigned().notNullable();
      table.datetime("datetime").notNullable();
      // incoming if wallet is receiver in txn, outgoing if wallet is sender in txn, neither if not relevant to txn type
      // (note a wallet could be sender and receiver in the same txn, so this is part of unique constraint below)
      table
        .enu("direction", ["incoming", "outgoing", "neither"], {
          useNative: true,
          enumName: "mobile_sdk_key_transaction_direction",
        })
        .notNullable()
        .defaultTo("neither");
      // null for unlimited precision and 0 for 0 scale (store as whole numbers to match on chain values, not as
      // post-division decimals)
      table.decimal("amount", null, 0).nullable(); // nullable if not relevant to this transaction_type, e.g. `other`
      table.decimal("gas_amount", null, 0).notNullable();
      table.decimal("gas_price", null, 0).notNullable();
      table.boolean("gas_paid_by_rna").notNullable();

      // kind of placeholder - not sure how we want to deal with multiple wallets involved in a single txn, currently
      // they would just have 2 separate DB rows (potentially with a different transaction_type)
      // we could normalize it out so we dont save redundant info like gas etc but this is probably fine for now
      table.unique([
        "wallet_id",
        "transaction_type",
        "transaction_hash",
        "direction",
      ]);
    }
  );
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema
      .dropTable("mobile_sdk_key_transactions")
      .raw("DROP TYPE mobile_sdk_key_transaction_type;");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
