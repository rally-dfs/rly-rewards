import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("tracked_token_accounts", function (table) {
    table.increments();
    table.string("address").notNullable().unique();
    // owner_address is ideally nonNullable but can be a bit flaky, kind of a nice to have anyway so non-fatal
    table.string("owner_address");
    table.integer("token_id").unsigned().notNullable();
    table.foreign("token_id").references("tracked_tokens.id");
    table.datetime("first_transaction_date").notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.dropTable("tracked_token_accounts");
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
