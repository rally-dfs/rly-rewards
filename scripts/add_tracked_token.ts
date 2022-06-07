import { PublicKey } from "@solana/web3.js";
import { isAddress } from "web3-utils";
import { getKnex, closeKnexConnection } from "../src/database";
import {
  TrackedToken,
  TrackedTokenChain,
} from "../src/knex-types/tracked_token";

/** Inserts new row to tracked_tokens
 *
 * arg 1 is mint_address
 * arg 2 is display_name
 * arg 3 is decimals
 * arg 4 is chain, either "SOLANA" or "ETHEREUM"
 *
 * e.g. $ npm run add-tracked-token 8c71AvjQeKKeWRe8jtTGG1bJ2WiYXQdbjqFbUfhHgSVk GARY 9 SOLANA
 *      $ npm run add-tracked-token 0xf1f955016EcbCd7321c7266BccFB96c68ea5E49b RLY 18 ETHEREUM
 */
const main = async () => {
  const knex = getKnex();

  let mintAddressString = process.argv[2];
  const displayNameString = process.argv[3];
  const decimalsString = process.argv[4];
  const chainString = process.argv[5];

  let chain: TrackedTokenChain;
  if (chainString!.toLowerCase() === "solana") {
    chain = "solana";

    // validate that pubkey is valid
    new PublicKey(mintAddressString!);
  } else if (chainString!.toLowerCase() === "ethereum") {
    chain = "ethereum";

    if (!isAddress(mintAddressString!)) {
      console.error(`Invalid ethereum address ${mintAddressString}`);
      return;
    }

    mintAddressString = mintAddressString?.startsWith("0x")
      ? mintAddressString
      : "0x" + mintAddressString;
  } else {
    console.error("Invalid chain, must be SOLANA or ETHEREUM");
    return;
  }

  console.log(
    `Adding tracked token for ${chain}: ${displayNameString} ${mintAddressString}, decimals ${decimalsString}`
  );

  const result = await knex<TrackedToken>("tracked_tokens").insert(
    {
      mint_address: mintAddressString,
      display_name: displayNameString,
      decimals: parseInt(decimalsString!),
      chain: chain,
    },
    "*" // need this for postgres to return the added result
  );

  console.log(`Done adding token mint PK ${result[0]!.id}`);

  closeKnexConnection();
};

main();
