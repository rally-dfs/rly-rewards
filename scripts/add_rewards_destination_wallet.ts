import { isAddress } from "web3-utils";
import { getKnex, closeKnexConnection } from "../src/database";
import { RewardsDestinationWallet } from "../src/knex-types/rewards_destination_wallet";

/** Inserts new row to rewards_destination_wallets
 *
 * arg 1 is destination_address
 * arg 2 is name (don't forget quotes)
 * arg 3 is token symbol
 * arg 4 is icon url (optional, "null" to omit)
 * arg 5 is website url (optional, "null" to omit)
 * arg 6 is display blockchain (optional, "null" to omit)
 * arg 7 is explorer url (optional, "null" to omit)
 *
 * e.g. $ npm run add-rewards-destination-wallet \
    0x0074F09Dce2A6eB20790Cf5Dd88BF526E38a0B23 \
    "Taki.app" \
    TAKI \
    null \
    "https://taki.app/" \
    Solana \
    "https://solscan.io/token/Taki7fi3Zicv7Du1xNAWLaf6mRK7ikdn77HeGzgwvo4"

* e.g. $ npm run add-rewards-destination-wallet \
    0x0fE77BeF7a8F5f31eaD9edE2F8206A7EF001FBc3 \
    "Gary Club" \
    $GARY \
    null \
    "https://exchange.socialconnector.io/swap" \
    Solana \
    "https://solscan.io/token/8c71AvjQeKKeWRe8jtTGG1bJ2WiYXQdbjqFbUfhHgSVk"
 */
const main = async () => {
  const knex = getKnex();

  // unfortunately bitquery casts all addresses to lowercase so a lot more efficient to store this as lowercase too
  const destinationAddress = (
    process.argv[2]?.startsWith("0x") ? process.argv[2] : "0x" + process.argv[2]
  ).toLowerCase();
  const name = process.argv[3];
  const tokenSymbol = process.argv[4];
  const iconUrl = process.argv[5] === "null" ? undefined : process.argv[5];
  const websiteUrl = process.argv[6] === "null" ? undefined : process.argv[6];
  const displayBlockchain =
    process.argv[7] === "null" ? undefined : process.argv[7];
  const explorerUrl = process.argv[8] === "null" ? undefined : process.argv[8];

  if (!isAddress(destinationAddress!)) {
    console.error(`Invalid ethereum address ${destinationAddress}`);
    return;
  }

  if (!name) {
    console.error(`Invalid token symbol ${name}`);
    return;
  }
  if (!tokenSymbol) {
    console.error(`Invalid token symbol ${tokenSymbol}`);
    return;
  }

  console.log(
    `Adding rewards destination wallet ${name}: ${destinationAddress}`
  );

  const result = await knex<RewardsDestinationWallet>(
    "rewards_destination_wallets"
  )
    .insert(
      {
        destination_address: destinationAddress,
        name: name,
        token_symbol: tokenSymbol,
        icon_url: iconUrl,
        website_url: websiteUrl,
        display_blockchain: displayBlockchain,
        explorer_url: explorerUrl,
      },
      "*" // need this for postgres to return the added result
    )
    .onConflict(["name"])
    .merge(); // just update metadata if there's a conflict

  console.log(`Done adding rewards destination wallet PK ${result[0]!.id}`);

  closeKnexConnection();
};

main();
