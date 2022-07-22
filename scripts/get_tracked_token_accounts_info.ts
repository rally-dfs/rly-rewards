import { closeKnexConnection } from "../src/database";
import { getAllTrackedTokenAccountInfoAndTransactionsForEndDate } from "../src/tracked_token_accounts";

/** Calls getAllTrackedTokenAccountInfoAndTransactionsForEndDate for an end date. Note that the date is always interpreted as
 * 00:00 UTC for consistency (i.e. you can't pass a specific time, only dates)
 *
 * arg 1 is the endDate
 * arg 2 is forceOneDay flag (default false). if true, will get 24 hours of data instead of getting data from
 * the previously fetched end date
 * arg 3 (optional) is the token ID to fetch
 *
 * e.g. $ npm run get-tracked-token-accounts-info 2022-05-05
 * e.g. $ npm run get-tracked-token-accounts-info 2022-05-05 true
 * e.g. $ npm run get-tracked-token-accounts-info 2022-05-05 true 9
 */
const main = async () => {
  const endDateString = process.argv[2];
  const forceOneDay = process.argv[3] === "true";
  const tokenId = process.argv[4];

  await getAllTrackedTokenAccountInfoAndTransactionsForEndDate(
    endDateString!,
    forceOneDay,
    tokenId
  );

  closeKnexConnection();
};

main();
