import { Router } from "express";
import { getKnex } from "./database";
import { TrackedToken } from "./knex-types/tracked_token";
import { LiquidityCollateralToken } from "./knex-types/liquidity_collateral_token";
import {
  totalWallets,
  totalWalletsByDay,
} from "./computed_metrics/wallet_metrics";
import {
  totalValueLockedInPools,
  valueLockedByDay,
} from "./computed_metrics/total_value_locked";
import {
  totalTransactions,
  transactionsByDay,
} from "./computed_metrics/transaction_metrics";
import {
  rlyRewardsDistributedByWeek,
  totalRLYRewardsDistributed,
} from "./computed_metrics/rewards_distributed";
import { getOffchainHardcodedData } from "./computed_metrics/offchain_hardcoded";

const routes = Router();

const knex = getKnex();

routes.get("/", async (_req, res) => {
  return res.json({
    message: "RLY Rewards!",
  });
});

routes.get("/vanity_metrics", async (_req, res) => {
  const allTrackedTokens = await knex<TrackedToken>("tracked_tokens");
  const allLiquidityCollateralTokens = await knex<LiquidityCollateralToken>(
    "liquidity_collateral_tokens"
  );

  const [
    onchainWalletCount,
    walletByDayData,
    onchainTransactionCount,
    transactionsByDayData,
    onchainTvl,
    tvlByDay,
    totalRewardsDistributed,
    rewardsByWeek,
  ] = await Promise.all([
    totalWallets(allTrackedTokens),
    totalWalletsByDay(allTrackedTokens),
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
    walletsByDay: walletByDayData,
    totalTransactions: totalTransactionCount,
    transactionsByDay: transactionsByDayData,
    tvl: tvl,
    tvlByDay: tvlByDay,
    totalRewards: totalRewardsDistributed,
    rewardsByWeek,
  });
});

export default routes;
