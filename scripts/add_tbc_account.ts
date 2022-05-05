import { getKnex, closeKnexConnection } from "../src/database";
import { PublicKey } from "@solana/web3.js";
import { TBCAccount } from "../src/types/tbc_accounts";

/** Inserts new row to tbc_accounts
 *
 * The first arg is the pubkey of the token_a_account_address to add
 */
const main = async () => {
  const knex = getKnex();

  const accountKey = process.argv[2]; // first argument in command line

  // validate key and convert to byte array to store in DB
  const pubkey = new PublicKey(accountKey);

  console.log(`Adding tbc account ${pubkey}`);

  const result = await knex<TBCAccount>("tbc_accounts").insert(
    {
      token_a_account_address: pubkey.toBytes(),
    },
    "*" // need this for postgres to return the added result
  );

  const addedKey = new PublicKey(result[0].token_a_account_address);

  console.log(`Done adding tbc account PK ${result[0].id}: ${addedKey}`);

  closeKnexConnection();
};

main();
