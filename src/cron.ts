import cron from "node-cron";

import { getAllDailyTokenBalancesSinceLastFetch } from "./tbc_accounts";

export function initCron() {
  cron.schedule("0 0 * * *", async () => {
    await getAllDailyTokenBalancesSinceLastFetch();
  });
}
