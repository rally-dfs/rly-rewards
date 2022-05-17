import { closeKnexConnection } from "../src/database";
import { getAllTokenAccountInfoAndTransactionsForEndDate } from "../src/token_accounts";

/** Calls getAllTokenAccountInfoAndTransactionsForEndDate for an end date. Note that the date is always interpreted as
 * 00:00 UTC for consistency (i.e. you can't pass a specific time, only dates)
 *
 * arg 1 is the endDate
 *
 * e.g. $ npm run get-token-accounts-info 2022-05-05
 */
const main = async () => {
  const endDateString = process.argv[2];

  await getAllTokenAccountInfoAndTransactionsForEndDate(endDateString!);

  closeKnexConnection();
};

main();
