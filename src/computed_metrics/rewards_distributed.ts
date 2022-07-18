import { getKnex } from "../database";

const knex = getKnex();

// this wallet is the only wallet used to distribute RLY rewards
const RLY_REWARD_ADDRESS = "0xe75ed5295c13d224036feb6439db7539fe6d7ce8";
// there's some random inbound transactions that we also add here to have a more accurate starting balance
const RLY_REWARD_STARTING_BALANCE = 7_500_000_000 + 5_000_000 + 270_000;

/** Gets the current balance in the RLY reward wallet and subtracts from the starting balance to calculate the
 * total rewards distributed
 *
 * @returns
 */
export async function totalRLYRewardsDistributed() {
  const dbResponse = await knex
    .select(
      knex.raw("approximate_minimum_balance / (10 ^ decimals) as balance")
    )
    .from("tracked_token_account_balances")
    .join(
      "tracked_token_accounts",
      "tracked_token_account_balances.tracked_token_account_id",
      "tracked_token_accounts.id"
    )
    .join(
      "tracked_tokens",
      "tracked_token_accounts.token_id",
      "tracked_tokens.id"
    )
    .where("address", RLY_REWARD_ADDRESS)
    .orderBy("datetime", "desc")
    .limit(1);

  const balance = dbResponse[0]?.balance;

  return balance
    ? Math.round(RLY_REWARD_STARTING_BALANCE - balance)
    : undefined;
}

export async function rlyRewardsDistributedByWeek() {
  const dbResponse = await knex
    .select(
      knex.raw(
        "date_trunc('week', datetime at time zone 'utc') at time zone 'utc' as week_start"
      )
    )
    .select(
      knex.raw("approximate_minimum_balance / (10 ^ decimals) as end_balance")
    )
    .distinctOn("week_start") // select distinct on (week_start) to ensure only get one balance per week
    .from("tracked_token_account_balances")
    .join(
      "tracked_token_accounts",
      "tracked_token_account_balances.tracked_token_account_id",
      "tracked_token_accounts.id"
    )
    .join(
      "tracked_tokens",
      "tracked_token_accounts.token_id",
      "tracked_tokens.id"
    )
    .where("address", RLY_REWARD_ADDRESS)
    .orderBy("week_start")
    .orderBy("datetime", "desc"); // make sure to sort by datetime desc so we get the latest value in a given week

  // if only one week (or zero) of balance data, then we can't calculate rewards distributed
  if (dbResponse.length <= 1) {
    return undefined;
  }

  return dbResponse
    .slice(1)
    .map((row, index) => ({
      weekStart: row.week_start,
      // the amount for this week is the end balance minus previous week's end balance (`index` here is 1 less than the
      // actual indexes of dbResponse since we slice'd off the first element, so we can just use dbResponse[index]
      // for the previous week)
      amount: Math.round(dbResponse[index].end_balance - row.end_balance),
    }))
    .filter(
      // make sure to filter out any amounts that used an invalid previous week (i.e. the previous week had no data)
      // (if we remove this filter, we just return 2+ weeks worth of rewards data in a single `amount` in those cases,
      // seems cleaner to just leave the missing week and its following week out entirely)
      (row, index) =>
        row.weekStart - dbResponse[index].week_start === 7 * 24 * 3600 * 1000
    );
}
