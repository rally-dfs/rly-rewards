import { getKnex, closeKnexConnection } from "../src/database";
import { PublicKey } from "@solana/web3.js";
import { TokenAccountMint } from "../src/knex-types/token_accounts";

/** Inserts new row to tbc_account_mints
 *
 * arg 1 is mint_address
 * arg 2 is decimals
 *
 * e.g. $ npm run add-token-account-mint 8c71AvjQeKKeWRe8jtTGG1bJ2WiYXQdbjqFbUfhHgSVk 9
 */
const main = async () => {
  const knex = getKnex();

  const mintAddressString = process.argv[2];
  const decimalsString = process.argv[3];

  // validate keys and convert to byte array to store in DB

  console.log(`Adding token mint ${mintAddressString}`);

  const result = await knex<TokenAccountMint>("token_account_mints").insert(
    {
      mint_address: new PublicKey(mintAddressString!).toBytes(),
      decimals: parseInt(decimalsString!),
    },
    "*" // need this for postgres to return the added result
  );

  console.log(`Done adding token mint PK ${result[0]!.id}`);

  closeKnexConnection();
};

main();
