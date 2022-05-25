import { getKnex, closeKnexConnection } from "../src/database";
import { PublicKey } from "@solana/web3.js";
import { TBCTokenMint } from "../src/knex-types/tbc_token_mint";

/** Inserts new row to tbc_token_mints
 *
 * arg 1 is mint_address
 * arg 2 is display_name
 * arg 3 is decimals
 *
 * e.g. $ npm run add-tbc-token-mint RLYv2ubRMDLcGG2UyvPmnPmkfuQTsMbg4Jtygc7dmnq sRLY 9
 */
const main = async () => {
  const knex = getKnex();

  const mintAddressString = process.argv[2];
  const displayNameString = process.argv[3];
  const decimalsString = process.argv[4];

  // validate keys and convert to byte array to store in DB

  console.log(
    `Adding token mint ${displayNameString} ${mintAddressString}, decimals: ${decimalsString}`
  );

  const result = await knex<TBCTokenMint>("tbc_token_mints").insert(
    {
      mint_address: new PublicKey(mintAddressString!).toBytes(),
      display_name: displayNameString,
      decimals: parseInt(decimalsString!),
    },
    "*" // need this for postgres to return the added result
  );

  console.log(`Done adding token mint PK ${result[0]!.id}`);

  closeKnexConnection();
};

main();
