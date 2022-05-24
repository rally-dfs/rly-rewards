import { getKnex, closeKnexConnection } from "../src/database";
import { PublicKey } from "@solana/web3.js";
import { TBCAccount } from "../src/knex-types/tbc_account";
import { TBCTokenMint } from "../src/knex-types/tbc_token_mint";
import bs58 from "bs58";

/** Inserts new row to tbc_accounts
 *
 * arg 1 is init_transaction_hash: the txn hash that this TBC was initialized in ("null" if it's just a 
 * random token account to track and not part of a TBC, e.g. a liquidity pool)
 * arg 2 is token_a_account_address: pubkey of the token_a_account_address
 * arg 3 is token_a_account_owner_address: pubkey of the owner of token_a_account_address
 * arg 4 is token_a_mint_address: mint address of token A (usually sRLY)
 *
 * e.g. $ npm run add-tbc-account \
    66tnH1qyBeNMWsGf5ZZUijK14RbzQ9JJ8ZUP15ayrGXMTAQnYPe4S7jhBZ1joHRpBib2khjweTiTXJUs1NfVuGqr \
    4Fce62WKxUeBrR7ShrxjC4WL6gcyeTEUyByCdFufBQuC Eh9mq1m2X2MgiZGd2hfMEbAuKZcbdXTo7EqFUcT9EyVS \
    RLYv2ubRMDLcGG2UyvPmnPmkfuQTsMbg4Jtygc7dmnq

 * e.g. $ npm run add-tbc-account \
    null \
    4Fce62WKxUeBrR7ShrxjC4WL6gcyeTEUyByCdFufBQuC Eh9mq1m2X2MgiZGd2hfMEbAuKZcbdXTo7EqFUcT9EyVS \
    RLYv2ubRMDLcGG2UyvPmnPmkfuQTsMbg4Jtygc7dmnq
 */
const main = async () => {
  const knex = getKnex();

  const initTransactionHashString = process.argv[2];
  const tokenAAccountAddressString = process.argv[3];
  const tokenAAccountOwnerAddressString = process.argv[4];
  const tokenAMintAddressString = process.argv[5];

  // validate keys and convert to byte array to store in DB

  let initTransactionHash: Uint8Array | undefined;
  if (initTransactionHashString === "null") {
    initTransactionHash = undefined;
  } else {
    initTransactionHash = bs58.decode(initTransactionHashString!);
    if (initTransactionHash.length != 64) {
      throw new Error(`Invalid transaction hash`);
    }
  }

  const tokenAAccountAddress = new PublicKey(
    tokenAAccountAddressString!
  ).toBytes();
  const tokenAAccountOwnerAddress = new PublicKey(
    tokenAAccountOwnerAddressString!
  ).toBytes();
  const tokenAMintAddress = new PublicKey(tokenAMintAddressString!).toBytes();

  console.log(
    `Adding tbc account ${initTransactionHashString}: ${tokenAAccountAddressString}, ` +
      `${tokenAAccountOwnerAddressString}, ${tokenAMintAddressString}`
  );

  const tokenAMintRow = await knex<TBCTokenMint>("tbc_token_mints")
    .select()
    .where({ mint_address: tokenAMintAddress });

  const result = await knex<TBCAccount>("tbc_accounts").insert(
    {
      init_transaction_hash: initTransactionHash,
      token_a_account_address: tokenAAccountAddress,
      token_a_account_owner_address: tokenAAccountOwnerAddress,
      token_a_mint_id: tokenAMintRow[0]!.id,
    },
    "*" // need this for postgres to return the added result
  );

  console.log(`Done adding tbc account PK ${result[0]!.id}`);

  closeKnexConnection();
};

main();
