import { getKnex, closeKnexConnection } from "../src/database";
import { EthereumTokenContract } from "../src/knex-types/ethereum_token_contracts";

/** Inserts new row to ethereum_token_contracts
 *
 * arg 1 is contract address
 * arg 2 is decimals
 *
 * e.g. $ npm run add-eth-token-contract 0xf1f955016EcbCd7321c7266BccFB96c68ea5E49b RLY 18
 */
const main = async () => {
  const knex = getKnex();

  let addressString = process.argv[2];
  const displayNameString = process.argv[3];
  const decimalsString = process.argv[4];

  if (addressString!.startsWith("0x")) {
    addressString = addressString!.substring(2);
  }

  console.log(
    `Adding eth token contract ${displayNameString} ${addressString} decimals ${decimalsString}`
  );

  const result = await knex<EthereumTokenContract>(
    "ethereum_token_contracts"
  ).insert(
    {
      address: addressString,
      display_name: displayNameString,
      decimals: parseInt(decimalsString!),
    },
    "*" // need this for postgres to return the added result
  );

  console.log(`Done adding token contract PK ${result[0]!.id}`);

  closeKnexConnection();
};

main();
