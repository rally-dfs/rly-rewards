import { closeKnexConnection } from "../src/database";
import { getAllEthTokenAddressInfoAndTransactionsForEndDate } from "../src/ethereum_token_addresses";

/** Similar to get_token_accounts_info script, but for ethereum instead of solana
 *
 * Calls getAllEthTokenAddressInfoAndTransactionsForEndDate for an end date. Note that the date is always interpreted as
 * 00:00 UTC for consistency (i.e. you can't pass a specific time, only dates)
 *
 * arg 1 is the endDate
 * arg 2 is forceOneDay flag (default false). if true, will get 24 hours of data instead of getting data from
 * the previously fetched end date
 *
 * e.g. $ npm run get-eth-token-address-info 2022-05-05
 * e.g. $ npm run get-eth-token-address-info 2022-05-05 true
 */
const main = async () => {
  const endDateString = process.argv[2];
  const forceOneDay = process.argv[3] === "true";

  await getAllEthTokenAddressInfoAndTransactionsForEndDate(
    endDateString!,
    forceOneDay
  );

  closeKnexConnection();
};

main();
