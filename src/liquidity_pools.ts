import { getKnex } from "./database";
import { getDailyTokenBalancesBetweenDates } from "./chain-data-utils/bq_liquidity_pool";
import { LiquidityPoolBalance } from "./knex-types/liquidity_pool_balance";
import { LiquidityCollateralTokenChain } from "./knex-types/liquidity_collateral_token";

/** Calls getDailyTokenBalancesBetweenDates for all token accounts, starting from the last date whose balance we have */
export async function getAllDailyTokenBalancesSinceLastFetch(
  latestEndDateString: string
) {
  const knex = getKnex();

  // get the max(datetime) grouped by token accounts
  const accountLatestDates: { liquidity_pool_id: number; latest_date: Date }[] =
    await knex("liquidity_pool_balances")
      .select("liquidity_pool_id")
      .max("datetime as latest_date")
      .groupBy("liquidity_pool_id");

  console.log("dates", accountLatestDates);

  for (let i = 0; i < accountLatestDates.length; i++) {
    const accountLatestDate = accountLatestDates[i]!;

    const earliestEndDate = new Date(
      Math.max(
        // one day after the latest_date we already have
        accountLatestDate.latest_date.valueOf() + 24 * 3600 * 1000,
        // set some reasonable minimum date, i.e. 2022-01-01
        new Date("2022-01-01T00:00:00Z").valueOf()
      )
    );

    await getDailyTokenBalances(
      earliestEndDate.toISOString().substring(0, 10),
      latestEndDateString,
      [accountLatestDate.liquidity_pool_id]
    );
  }
}

/** Calls getDailyTokenBalancesBetweenDates for specific TBCAccounts. Note that the date is always interpreted as 00:00 UTC
 * for consistency (i.e. you can't pass a specific time, only dates, that's why they're accepted as strings)
 *
 * @argument earliestEndDateString earliest endDate to fetch (inclusive), as a string. e.g. "2022-04-01"
 * @argument latestEndDateString latest endDate to fetch (inclusive), as a string, e.g. "2022-05-01"
 * @argument liquidityPoolIds ids of TBCAccounts to fetch. Fetches all accounts if undefined
 */
export async function getDailyTokenBalances(
  earliestEndDateString: string,
  latestEndDateString: string,
  liquidityPoolIds?: number[]
) {
  const knex = getKnex();

  const earliestEndDate = new Date(`${earliestEndDateString}T00:00:00Z`);
  const latestEndDate = new Date(`${latestEndDateString}T00:00:00Z`);

  if (latestEndDate.valueOf() < earliestEndDate.valueOf()) {
    console.log(
      `invalid date range ${earliestEndDate} to ${latestEndDate}, no data to fetch`
    );
    return;
  }

  let query = knex("liquidity_pools")
    .join(
      "liquidity_collateral_tokens",
      "liquidity_pools.collateral_token_id",
      "liquidity_collateral_tokens.id"
    )
    .select(
      "liquidity_pools.id as liquidity_pool_id",
      "liquidity_pools.collateral_token_account",
      "liquidity_pools.collateral_token_account_owner",
      "liquidity_collateral_tokens.mint_address",
      "liquidity_collateral_tokens.decimals",
      "liquidity_collateral_tokens.chain"
    );

  if (liquidityPoolIds !== undefined) {
    query = query.whereIn("liquidity_pools.id", liquidityPoolIds);
  }

  const allAccounts: {
    liquidity_pool_id: number;
    collateral_token_account: string;
    collateral_token_account_owner: string;
    mint_address: string;
    decimals: number;
    chain: LiquidityCollateralTokenChain;
  }[] = await query;

  // TODO: we could optimize this by also seeing what balance data is already in the DB and skipping those dates
  // (and adding a --force flag to override)

  for (let i = 0; i < allAccounts.length; i++) {
    const account = allAccounts[i]!;
    console.log(
      `==== Fetching balances for account ${account.collateral_token_account} from ${earliestEndDate} to ${latestEndDate} ====`
    );

    try {
      const tokenBalanceDates = await getDailyTokenBalancesBetweenDates(
        account.collateral_token_account,
        account.collateral_token_account_owner,
        account.mint_address,
        account.chain,
        earliestEndDate,
        latestEndDate
      );

      const result = await knex<LiquidityPoolBalance>("liquidity_pool_balances")
        .insert(
          tokenBalanceDates.map((balanceDate) => {
            return {
              liquidity_pool_id: account.liquidity_pool_id,
              datetime: balanceDate.dateExclusive,
              balance: balanceDate.balance,
            };
          }),
          "*" // need this for postgres to return the added result
        )
        .onConflict(["liquidity_pool_id", "datetime"])
        .merge(); // just update the balance if there's a conflict

      console.log(
        `Inserted balances for ${
          account.collateral_token_account_owner
        }, pks ${result.map((res) => res.id)}`
      );
    } catch (error) {
      console.log("Error fetching account", account, error);
    }
  }

  console.log(`Done fetching all balances`);
}
