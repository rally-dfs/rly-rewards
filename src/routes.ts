import { Router } from "express";
import { getKnex } from "./database";
import { TrackedToken } from "./knex-types/tracked_token";
import { LiquidityCollateralToken } from "./knex-types/liquidity_collateral_token";
import {
  totalActiveWallets,
  totalActiveWalletsByDay,
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
    tvl,
    tvlByDay,
    activeWalletsTotal,
    activeWalletsByDay,
  ] = await Promise.all([
    totalWallets(allTrackedTokens),
    totalWalletsByDay(allTrackedTokens),
    totalTransactions(allTrackedTokens),
    transactionsByDay(allTrackedTokens),
    totalValueLockedInPools(allLiquidityCollateralTokens),
    valueLockedByDay(allLiquidityCollateralTokens),
    totalActiveWallets(allTrackedTokens),
    totalActiveWalletsByDay(allTrackedTokens),
  ]);

  // add the hardcoded metrics for vanity only
  const offchainData = getOffchainHardcodedData();
  const totalWalletCount = onchainWalletCount + offchainData.totalWalletCount;
  const totalTransactionCount =
    onchainTransactionCount + offchainData.totalTransactionCount;

  res.json({
    totalTokensTracked: allTrackedTokens.length,
    totalWallets: totalWalletCount,
    walletsByDay: walletByDayData,
    activeWalletsByDay: activeWalletsByDay,
    totalActiveWallets: activeWalletsTotal,
    totalTransactions: totalTransactionCount,
    transactionsByDay: transactionsByDayData,
    tvl: tvl,
    tvlByDay: tvlByDay,
  });
});

export default routes;
