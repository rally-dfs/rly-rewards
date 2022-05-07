import { getKnex, closeKnexConnection } from "../src/database";
import { PublicKey } from "@solana/web3.js";
import { TokenMint } from "../src/types/token_mints";

/** Inserts new row to tbc_accounts
 *
 * arg 1 is mint_address
 * arg 2 is decimals
 *
 * e.g. $ npm run add-token-mint RLYv2ubRMDLcGG2UyvPmnPmkfuQTsMbg4Jtygc7dmnq 9
 */
const main = async () => {
  const knex = getKnex();

  const mintAddressString = process.argv[2];
  const decimalsString = process.argv[3];

  // validate keys and convert to byte array to store in DB

  console.log(
    `Adding token mint ${mintAddressString}, decimals: ${decimalsString}`
  );

  const result = await knex<TokenMint>("token_mints").insert(
    {
      mint_address: new PublicKey(mintAddressString).toBytes(),
      decimals: parseInt(decimalsString),
    },
    "*" // need this for postgres to return the added result
  );

  console.log(`Done adding token mint PK ${result[0].id}`);

  closeKnexConnection();
};

main();
