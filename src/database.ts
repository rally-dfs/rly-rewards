import { Knex, knex } from "knex";
import "dotenv/config";

let knex_connection: Knex | undefined;

/** Gets the current open DB connection, creating it if it doesn't exist
 *
 * @returns Knex object
 */
export function getKnex() {
  if (!knex_connection) {
    const connection = {
      // POSTGRES_FOO intended for local dev, RDS_FOO are AWS hardcoded env variables intended for prod (though
      // obviously if you want you can use RDS for local dev too)
      host: process.env.POSTGRES_HOSTNAME || process.env.RDS_HOSTNAME,
      port: parseInt((process.env.POSTGRES_PORT || process.env.RDS_PORT)!),
      database: process.env.POSTGRES_DB_NAME || process.env.RDS_DB_NAME,
      user: process.env.POSTGRES_USERNAME || process.env.RDS_USERNAME,
      password: process.env.POSTGRES_PASSWORD || process.env.RDS_PASSWORD,
    };

    if (process.env.NODE_ENV === "test") {
      connection["database"] =
        process.env.POSTGRES_TEST_DB_NAME || connection["database"];
    }

    console.log(`initializing knex db connection ${connection.database}`);

    knex_connection = knex({
      client: "pg",
      connection,
    });
  }

  return knex_connection;
}

/** Destroys the currently open knex connection if there is one.
 *
 * This doesn't usually need to be called (e.g. in the webserver) but is useful
 * for one off scripts etc where the connection should be managed explicitly
 */
export async function closeKnexConnection() {
  if (knex_connection) {
    await knex_connection.destroy();
    knex_connection = undefined;
  }
}
