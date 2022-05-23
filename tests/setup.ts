import { Knex } from "knex";
import { getKnex } from "../src/database";

async function getAllTables(knex: Knex<any, any[]>): Promise<string[]> {
  const rawQueryResult = await knex.raw(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'"
  );

  const allTableNames: string[] = rawQueryResult.rows.map(
    (r: { tablename: string }) => r.tablename
  );

  return allTableNames.filter(
    (tablename) => !tablename.match("knex_migration")
  );
}

async function truncateAllTables(knex: Knex<any, any[]>) {
  const tables = await getAllTables(knex);
  await knex.transaction(async (txn) => {
    for (const table of tables) {
      await txn.raw(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);
    }
  });
}

export const mochaHooks = {
  afterEach: [
    async () => {
      const knex = getKnex();
      await truncateAllTables(knex);
    },
  ],
};
