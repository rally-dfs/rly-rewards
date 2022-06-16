import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema
    .alterTable("tracked_token_accounts", function (table) {
      // address is no longer globally unique on ethereum, needs to be unique(address, token_id)
      table.dropUnique(["address"]);
      table.unique(["address", "token_id"]);
    })
    .alterTable("tracked_token_account_transactions", function (table) {
      // an account can have both incoming and outgoing transfers in the same transaction so need to add transfer_in
      table.dropUnique(["tracked_token_account_id", "transaction_hash"]);
      table.unique([
        "tracked_token_account_id",
        "transaction_hash",
        "transfer_in",
      ]);
    });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema
      .alterTable("tracked_token_accounts", function (table) {
        table.dropUnique(["address", "token_id"]);
        table.unique(["address"]);
      })
      .alterTable("tracked_token_account_transactions", function (table) {
        table.dropUnique([
          "tracked_token_account_id",
          "transaction_hash",
          "transfer_in",
        ]);
        table.unique(["tracked_token_account_id", "transaction_hash"]);
      });
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
