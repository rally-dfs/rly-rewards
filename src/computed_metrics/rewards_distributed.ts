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

/** Fetches the total rewards distributed since `startDate`, rounded to nearest whole number and sorted by total
 *
 * @param destinationNames if null, returns amount for all destinations
 * @param startDate if null, returns amounts since start of time
 */
export async function rewardsDistributedToDestinationWallets(
  destinationNames?: string[],
  startDate?: Date
) {
  // find all txn hashes that come from RLY_REWARD_ADDRESS
  const rewardTransactionHashesSubquery = knex
    .select("transaction_hash")
    .from("tracked_token_account_transactions")
    .join(
      "tracked_token_accounts",
      "tracked_token_account_transactions.tracked_token_account_id",
      "tracked_token_accounts.id"
    )
    .where("transfer_in", false)
    .where("address", RLY_REWARD_ADDRESS)
    .modify((query) => {
      if (startDate) {
        query.where("datetime", ">=", startDate);
      }
    });

  // make sure we only calculate totals for the rewards_destination_wallets we care about (just a performance optimization)
  const destinationAddressesSubquery = knex
    .select("destination_address")
    .from("rewards_destination_wallets")
    .modify((query) => {
      if (destinationNames) {
        query.whereIn("rewards_destination_wallets.name", destinationNames);
      }
    });

  const amountsByAddressSubquery = knex
    .select("address")
    .select(knex.raw("sum(amount / (10 ^ decimals)) as total"))
    .from("tracked_token_account_transactions")
    .join(
      "tracked_token_accounts",
      "tracked_token_account_transactions.tracked_token_account_id",
      "tracked_token_accounts.id"
    )
    .join(
      "tracked_tokens",
      "tracked_token_accounts.token_id",
      "tracked_tokens.id"
    )
    .where("transfer_in", true)
    .whereIn("transaction_hash", rewardTransactionHashesSubquery)
    .whereIn("address", destinationAddressesSubquery)
    .groupBy("address")
    .as("amounts_by_address");

  const amounts: {
    name: string;
    token_symbol: string;
    destination_address: string;
    icon_url: string;
    website_url: string;
    display_blockchain: string;
    explorer_url: string;
    total: number;
  }[] = await knex
    .select("rewards_destination_wallets.name")
    .select("rewards_destination_wallets.token_symbol")
    .select("rewards_destination_wallets.destination_address")
    .select("rewards_destination_wallets.icon_url")
    .select("rewards_destination_wallets.website_url")
    .select("rewards_destination_wallets.display_blockchain")
    .select("rewards_destination_wallets.explorer_url")
    .select("total")
    .from("rewards_destination_wallets")
    // use left join so we can return rewards destinations with 0 total
    .leftJoin(
      amountsByAddressSubquery,
      "rewards_destination_wallets.destination_address",
      "amounts_by_address.address"
    )
    .modify((query) => {
      if (destinationNames) {
        query.whereIn("rewards_destination_wallets.name", destinationNames);
      }
    });

  return amounts
    .map((row) => ({
      name: row.name,
      tokenSymbol: row.token_symbol,
      address: row.destination_address,
      iconUrl: row.icon_url,
      websiteUrl: row.website_url,
      displayBlockchain: row.display_blockchain,
      explorerUrl: row.explorer_url,
      total: Math.round(row.total),
    }))
    .sort((row1, row2) => row2.total - row1.total);
}
