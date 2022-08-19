import { PublicKey } from "@solana/web3.js";
import { isAddress } from "web3-utils";
import { getKnex, closeKnexConnection } from "../src/database";
import {
  LiquidityCollateralToken,
  LiquidityCollateralTokenChain,
} from "../src/knex-types/liquidity_collateral_token";

/** Inserts new row to liquidity_collateral_token
 *
 * arg 1 is mint_address
 * arg 2 is display_name
 * arg 3 is decimals
 * arg 4 is chain: either "solana" or "ethereum"
 *
 * e.g. $ npm run add-liquidity-collateral-token RLYv2ubRMDLcGG2UyvPmnPmkfuQTsMbg4Jtygc7dmnq sRLY 9 solana
 * e.g. $ npm run add-liquidity-collateral-token 0xf1f955016ecbcd7321c7266bccfb96c68ea5e49b RLY 18 ethereum
 */
const main = async () => {
  const knex = getKnex();

  let mintAddressString = process.argv[2];
  const displayNameString = process.argv[3];
  const decimalsString = process.argv[4];
  const chainString = process.argv[5];

  // validate keys and convert to byte array to store in DB
  let chain: LiquidityCollateralTokenChain;
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
    `Adding token mint ${displayNameString} ${mintAddressString}, decimals: ${decimalsString}`
  );

  const result = await knex<LiquidityCollateralToken>(
    "liquidity_collateral_tokens"
  ).insert(
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
