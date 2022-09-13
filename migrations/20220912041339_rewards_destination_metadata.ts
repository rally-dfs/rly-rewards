import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable(
    "rewards_destination_wallets",
    function (table) {
      table.string("icon_url").nullable();
      table.string("website_url").nullable();
      table.string("display_blockchain").nullable();
      table.string("explorer_url").nullable();
    }
  );
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return knex.schema.alterTable(
      "rewards_destination_wallets",
      function (table) {
        table.dropColumn("icon_url");
        table.dropColumn("website_url");
        table.dropColumn("display_blockchain");
        table.dropColumn("explorer_url");
      }
    );
  } else {
    console.log(
      `env (${process.env.NODE_ENV}) is not set to development, refusing to drop table`
    );
  }
}
