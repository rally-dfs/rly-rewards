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
