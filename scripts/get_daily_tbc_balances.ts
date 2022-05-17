import { closeKnexConnection } from "../src/database";
import { getDailyTokenBalances } from "../src/tbc_accounts";

/** Calls getDailyTokenBalancesBetweenDates for all TBCAccounts. Note that the date is always interpreted as 00:00 UTC
 * for consistency (i.e. you can't pass a specific time, only dates)
 *
 * arg 1 is earliestEndDate to fetch
 * arg 2 is latestEndDate to fetch
 * arg 3 (optional) is a specific token account ID to fetch
 *
 * e.g. $ npm run get-daily-tbc-balances 2022-04-26 2022-05-05
 * e.g. $ npm run get-daily-tbc-balances 2022-04-26 2022-05-05 1
 */
const main = async () => {
  const earliestEndDateString = process.argv[2];
  const latestEndDateString = process.argv[3];
  const tokenId = process.argv[4] ? [parseInt(process.argv[4])] : undefined;

  await getDailyTokenBalances(
    earliestEndDateString!,
    latestEndDateString!,
    tokenId
  );

  closeKnexConnection();
};

main();
