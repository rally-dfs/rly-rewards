import { getKnex, closeKnexConnection } from "../src/database";
import { TrackedToken } from "../src/knex-types/tracked_token";

/** Inserts new row to tracked_tokens
 *
 * arg 1 is mint_address
 * arg 2 is display_name
 * arg 3 is decimals
 *
 * e.g. $ npm run add-tracked-token 8c71AvjQeKKeWRe8jtTGG1bJ2WiYXQdbjqFbUfhHgSVk GARY 9
 */
const main = async () => {
  const knex = getKnex();

  const mintAddressString = process.argv[2];
  const displayNameString = process.argv[3];
  const decimalsString = process.argv[4];

  // validate keys and convert to byte array to store in DB

  console.log(
    `Adding token mint ${displayNameString} ${mintAddressString}, decimals ${decimalsString}`
  );

  const result = await knex<TrackedToken>("tracked_tokens").insert(
    {
      mint_address: mintAddressString,
      display_name: displayNameString,
      decimals: parseInt(decimalsString!),
    },
    "*" // need this for postgres to return the added result
  );

  console.log(`Done adding token mint PK ${result[0]!.id}`);

  closeKnexConnection();
};

main();
