import { Router } from "express";
import { getKnex } from "./database";
import { TrackedToken } from "./knex-types/tracked_token";
import { LiquidityCollateralToken } from "./knex-types/liquidity_collateral_token";
import { totalWallets } from "./computed_metrics/wallet_metrics";
import {
  totalValueLockedInPools,
  valueLockedByDay,
} from "./computed_metrics/total_value_locked";
import {
  totalTransactions,
  transactionsByDay,
} from "./computed_metrics/transaction_metrics";
import {
  rewardsDistributedToDestinationWallets,
  rlyRewardsDistributedByWeek,
  totalRLYRewardsDistributed,
} from "./computed_metrics/rewards_distributed";
import { getOffchainHardcodedData } from "./computed_metrics/offchain_hardcoded";
import { getBalancesByDateByTokenId } from "./tracked_token_accounts";

const routes = Router();

const knex = getKnex();

routes.get("/", async (_req, res) => {
  return res.json({
    message: "RLY Rewards!",
  });
});

routes.get("/consistency_status", async (_req, res) => {
  // for latestLiquidityPoolBalances {mostRecentDate: [account]}
  const poolsQuery = knex
    .select("collateral_token_account")
    .max("datetime as max_datetime")
    .from("liquidity_pool_balances")
    .join(
      "liquidity_pools",
      "liquidity_pools.id",
      "liquidity_pool_balances.liquidity_pool_id"
    )
    .groupBy("collateral_token_account");

  const balancesByDateByTokenIdQuery = getBalancesByDateByTokenId(new Date());

  const tokensWithAccountsAndTxnsQuery = knex
    .select("token_id", "mint_address", "display_name")
    .max("datetime as max_datetime")
    .countDistinct("tracked_token_accounts.id as account_count")
    .from("tracked_token_accounts")
    .leftJoin(
      // make sure to left join so account_count includes accounts with 0 txns still
      "tracked_token_account_transactions",
      "tracked_token_accounts.id",
      "tracked_token_account_transactions.tracked_token_account_id"
    )
    .join(
      "tracked_tokens",
      "tracked_tokens.id",
      "tracked_token_accounts.token_id"
    )
    .groupBy("token_id", "mint_address", "display_name");

  const [pools, balancesByDateByTokenId, tokensWithAccountsAndTxns] =
    await Promise.all([
      poolsQuery,
      balancesByDateByTokenIdQuery,
      tokensWithAccountsAndTxnsQuery,
    ]);

  return res.json({
    // {mostRecentDate: [accounts]}
    // useful for checking if a specific liquidity pool is behind
    latestLiquidityPoolBalances: pools.reduce((poolsByDate, pool) => {
      const dateString = pool.max_datetime.toISOString();
      poolsByDate[dateString] = poolsByDate[dateString] || [];
      poolsByDate[dateString].push(pool.collateral_token_account);
      return poolsByDate;
    }, {}),

    // [{id, mint_address, display_name, max_datetime, account_count}]
    // just general token account info
    tokensWithAccountsAndTxns,

    // {tokenId: [recentDates]}
    // useful for checking there there's only 1 most recent balance date per token
    // (if there's > 1, that means there's some inconsistency in TrackedTokenAccountBalance table)
    uniqueLatestTokenBalanceDates: Object.fromEntries(
      Object.entries(balancesByDateByTokenId).map(
        ([tokenId, balancesByDate]) => [tokenId, Object.keys(balancesByDate)]
      )
    ),

    // {mostRecentDate: [mintAddresses]}
    // useful for seeing if a specific tracked token is behind (could also use TrackedTokenAccountBalance data
    // for this but transactions should be more accurate)
    latestTokenTransactions: tokensWithAccountsAndTxns.reduce(
      (tokensByDate, token) => {
        const dateString = token.max_datetime.toISOString();
        tokensByDate[dateString] = tokensByDate[dateString] || [];
        tokensByDate[dateString].push(token.mint_address);
        return tokensByDate;
      },
      {}
    ),
  });
});

routes.get("/vanity_metrics", async (_req, res) => {
  const allTrackedTokens = await knex<TrackedToken>("tracked_tokens");
  const allLiquidityCollateralTokens = await knex<LiquidityCollateralToken>(
    "liquidity_collateral_tokens"
  );

  // totalWallets uses the balances table which is quite large, so put some time bounds
  // for performance optimization
  const weekAgo = new Date(new Date().valueOf() - 7 * 24 * 3600 * 1000);

  const [
    onchainWalletCount,
    onchainTransactionCount,
    transactionsByDayData,
    onchainTvl,
    tvlByDay,
    totalRewardsDistributed,
    rewardsByWeek,
  ] = await Promise.all([
    // totalWallets will return the same result no matter which start date assuming no data consistency
    // issues (since token balances has a row for every day). use 7 days to be extra safe
    totalWallets(allTrackedTokens, { startDate: weekAgo }),
    totalTransactions(allTrackedTokens),
    transactionsByDay(allTrackedTokens),
    totalValueLockedInPools(allLiquidityCollateralTokens),
    valueLockedByDay(allLiquidityCollateralTokens),
    totalRLYRewardsDistributed(),
    rlyRewardsDistributedByWeek(),
  ]);

  // add the hardcoded metrics for vanity only
  const offchainData = getOffchainHardcodedData();
  const totalWalletCount = onchainWalletCount + offchainData.totalWalletCount;
  const totalTransactionCount =
    onchainTransactionCount + offchainData.totalTransactionCount;
  const tvl = onchainTvl + offchainData.tvl;

  res.json({
    totalTokensTracked: allTrackedTokens.length,
    totalWallets: totalWalletCount,
    totalTransactions: totalTransactionCount,
    transactionsByDay: transactionsByDayData,
    tvl: tvl,
    tvlByDay: tvlByDay,
    totalRewards: totalRewardsDistributed,
    rewardsByWeek,
  });
});

routes.get("/rewards_distributed", async (_req, res) => {
  const sevenDaysAgo = new Date(new Date().valueOf() - 7 * 24 * 3600 * 1000);
  const ninetyDaysAgo = new Date(new Date().valueOf() - 90 * 24 * 3600 * 1000);

  const [weeklyRewards, quarterlyRewards] = await Promise.all([
    rewardsDistributedToDestinationWallets(undefined, sevenDaysAgo),
    rewardsDistributedToDestinationWallets(undefined, ninetyDaysAgo),
  ]);

  // extrapolate yearly rewards based on past week of rewards
  const yearlyRewardsExtrapolations = weeklyRewards.map((row) => ({
    name: row.name,
    tokenSymbol: row.tokenSymbol,
    total: Math.round((365 / 7) * row.total),
  }));

  return res.json({
    weeklyRewards: weeklyRewards.sort((row1, row2) => row2.total - row1.total),
    quarterlyRewards: quarterlyRewards.sort(
      (row1, row2) => row2.total - row1.total
    ),
    yearlyRewardsExtrapolations: yearlyRewardsExtrapolations.sort(
      (row1, row2) => row2.total - row1.total
    ),
  });
});

export default routes;
