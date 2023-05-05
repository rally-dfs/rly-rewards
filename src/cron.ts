import cron from "node-cron";

import { getAllDailyTokenBalancesSinceLastFetch } from "./liquidity_pools";
import { getAllTrackedTokenAccountInfoAndTransactionsForEndDate } from "./tracked_token_accounts";
import { getMobileSDKTransactions } from "./mobile_sdk";

export function initCron() {
  cron.schedule("0 0 * * *", async () => {
    // wait ~48 hours from today to be safe, sometimes the solana/bitquery APIs are behind (could maybe cut this down
    // if we really want, need to investigate a bit exactly how long it takes)
    const latestEndDate = new Date(new Date().valueOf() - 48 * 3600 * 1000);

    await getAllDailyTokenBalancesSinceLastFetch(
      latestEndDate.toISOString().substring(0, 10)
    );
    await getAllTrackedTokenAccountInfoAndTransactionsForEndDate(
      latestEndDate.toISOString().substring(0, 10),
      false
    );
  });

  // sometimes due to network flakiness etc some of the above tasks fail, run it again a few hours later
  // (it's idempotent so okay to run multiple times in a day)
  cron.schedule("0 4 * * *", async () => {
    // wait ~48 hours from today to be safe, sometimes the solana/bitquery APIs are behind (could maybe cut this down
    // if we really want, need to investigate a bit exactly how long it takes)
    const latestEndDate = new Date(new Date().valueOf() - 48 * 3600 * 1000);

    await getAllDailyTokenBalancesSinceLastFetch(
      latestEndDate.toISOString().substring(0, 10)
    );
    await getAllTrackedTokenAccountInfoAndTransactionsForEndDate(
      latestEndDate.toISOString().substring(0, 10),
      false
    );
  });

  cron.schedule("0 * * * *", async () => {
    // fetching the mobile SDK metrics is pretty light weight and just depends on blocks
    // (not e.g. UTC midnight time stamps), so we can run it every hour
    await getMobileSDKTransactions(undefined, undefined);
  });
}
