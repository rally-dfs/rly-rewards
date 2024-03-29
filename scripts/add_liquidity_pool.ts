import { getKnex, closeKnexConnection } from "../src/database";
import { LiquidityPool } from "../src/knex-types/liquidity_pool";
import {
  LiquidityCollateralToken,
  LiquidityCollateralTokenChain,
} from "../src/knex-types/liquidity_collateral_token";

/** Inserts new row to liquidity_pools
 *
 * arg 1 is init_transaction_hash: the txn hash that this TBC was initialized in ("null" if it's just a 
 * random token account to track and not part of a TBC, e.g. a liquidity pool)
 * arg 2 is collateral_token_account: pubkey of the collateral_token_account
 * arg 3 is collateral_token_account_owner: pubkey of the owner of collateral_token_account (optional for eth)
 * arg 4 is collateral_token_address: mint address of token A (usually sRLY or eth RLY)
 * arg 5 is chain: either "solana" or "ethereum"
 *
 * e.g. $ npm run add-liquidity-pool \
    66tnH1qyBeNMWsGf5ZZUijK14RbzQ9JJ8ZUP15ayrGXMTAQnYPe4S7jhBZ1joHRpBib2khjweTiTXJUs1NfVuGqr \
    4Fce62WKxUeBrR7ShrxjC4WL6gcyeTEUyByCdFufBQuC \
    Eh9mq1m2X2MgiZGd2hfMEbAuKZcbdXTo7EqFUcT9EyVS \
    RLYv2ubRMDLcGG2UyvPmnPmkfuQTsMbg4Jtygc7dmnq \
    solana

 * note solana requires both collateral_token_account and owner
 * e.g. $ npm run add-liquidity-pool \
    null \
    4Fce62WKxUeBrR7ShrxjC4WL6gcyeTEUyByCdFufBQuC \
    Eh9mq1m2X2MgiZGd2hfMEbAuKZcbdXTo7EqFUcT9EyVS \
    RLYv2ubRMDLcGG2UyvPmnPmkfuQTsMbg4Jtygc7dmnq \
    solana

 * note ethereum does not require a collateral_token_account_owner
 * e.g. $ npm run add-liquidity-pool \
    null \
    0xc93E3583C6DC8DfDF59b974D704b5b79F02e210a \
    null \
    0xf1f955016ecbcd7321c7266bccfb96c68ea5e49b \
    ethereum
 */
const main = async () => {
  const knex = getKnex();

  const initTransactionHashString = process.argv[2];
  const collateralTokenAccountAddressString = process.argv[3];
  const collateralTokenAccountOwnerAddressString = process.argv[4];
  const collateralTokenMintAddressString = process.argv[5];
  const chainString = process.argv[6];

  if (
    !collateralTokenAccountOwnerAddressString &&
    chainString?.toLowerCase() !== "ethereum"
  ) {
    console.error("Empty owner address is only allowed for ETHEREUM chain");
    return;
  }

  console.log(
    `Adding liquidity pool ${initTransactionHashString}: ${collateralTokenAccountAddressString}, ` +
      `${collateralTokenAccountOwnerAddressString}, ${collateralTokenMintAddressString}`
  );

  const collateralTokenMintRow = await knex<LiquidityCollateralToken>(
    "liquidity_collateral_tokens"
  )
    .select()
    .where({
      mint_address: collateralTokenMintAddressString,
      chain: chainString as LiquidityCollateralTokenChain,
    });

  if (collateralTokenMintRow.length === 0) {
    console.error(
      `Invalid mint address ${collateralTokenMintAddressString} for chain ${chainString}`
    );
    return;
  }

  const result = await knex<LiquidityPool>("liquidity_pools").insert(
    {
      init_transaction_hash: initTransactionHashString,
      collateral_token_account: collateralTokenAccountAddressString,
      collateral_token_account_owner: collateralTokenAccountOwnerAddressString,
      collateral_token_id: collateralTokenMintRow[0]!.id,
    },
    "*" // need this for postgres to return the added result
  );

  console.log(`Done adding liquidity pool PK ${result[0]!.id}`);

  closeKnexConnection();
};

main();
