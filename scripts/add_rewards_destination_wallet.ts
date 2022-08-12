import { isAddress } from "web3-utils";
import { getKnex, closeKnexConnection } from "../src/database";
import { RewardsDestinationWallet } from "../src/knex-types/rewards_destination_wallet";

/** Inserts new row to rewards_destination_wallets
 *
 * arg 1 is destination_address
 * arg 2 is name (don't forget quotes)
 * arg 3 is token symbol
 *
 * e.g. $ npm run add-rewards-destination-wallet 0x458888Bdf28f2923b3F837B5483D6ee08A8754B9 "Trick Shot Pool" JOYRIDE
 *      $ npm run add-rewards-destination-wallet 0x6f61832a0616bD8625A3E894d1d65A51bb17f503 ALLIE ALLIE
 */
const main = async () => {
  const knex = getKnex();

  // unfortunately bitquery casts all addresses to lowercase so a lot more efficient to store this as lowercase too
  const destinationAddress = (
    process.argv[2]?.startsWith("0x") ? process.argv[2] : "0x" + process.argv[2]
  ).toLowerCase();
  const name = process.argv[3];
  const tokenSymbol = process.argv[4];

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
  ).insert(
    {
      destination_address: destinationAddress,
      name: name,
      token_symbol: tokenSymbol,
    },
    "*" // need this for postgres to return the added result
  );

  console.log(`Done adding rewards destination wallet PK ${result[0]!.id}`);

  closeKnexConnection();
};

main();
