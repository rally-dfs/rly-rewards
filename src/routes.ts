import { PublicKey } from "@solana/web3.js";
import { Router } from "express";
import { getKnex } from "./database";
import { LiquidityPool } from "./knex-types/liquidity_pool";
import { LiquidityPoolBalance } from "./knex-types/liquidity_pool_balance";
import { TrackedTokenAccountBalance } from "./knex-types/tracked_token_account_balance";
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

const routes = Router();

const knex = getKnex();

routes.get("/", async (_req, res) => {
  // this is all just a placeholder to show the data, we would probably split these into dedicated
  // APIs based on the frontend UI (plus the return formats are all inconsistent right now)
  const accounts = await knex<LiquidityPool>("liquidity_pools").select();

  const liquidityPoolBalances = await knex<LiquidityPoolBalance>(
    "liquidity_pool_balances"
  )
    .select()
    .orderBy("datetime");
  const liquidityPoolBalancesByAccount: {
    [key: number]: LiquidityPoolBalance[];
  } = {};
  liquidityPoolBalances.reduce((accumulator, accountBalance) => {
    if (accumulator[accountBalance.liquidity_pool_id] === undefined) {
      accumulator[accountBalance.liquidity_pool_id] = [];
    }
    accumulator[accountBalance.liquidity_pool_id]?.push(accountBalance);
    return accumulator;
  }, liquidityPoolBalancesByAccount);

  const tokenAccountMints = (
    await knex<TrackedToken>("tracked_tokens").select()
  ).map((mint) => {
    return {
      id: mint.id,
      mint_address: new PublicKey(mint.mint_address).toString(),
      decimals: mint.decimals,
    };
  });

  // this any[] should probably be replaced by a real type once this API isn't just a placeholder anymore
  const newTokenHolderDates: any[] = await knex("tracked_token_accounts")
    .select("token_id", "first_transaction_date")
    .count("address as count")
    .groupBy("first_transaction_date", "token_id")
    .orderBy("first_transaction_date");
  const newTokenHolderDatesByMint: { [key: number]: Object[] } = {};
  newTokenHolderDates.reduce((accumulator, tokenAccount) => {
    if (accumulator[tokenAccount.token_id] === undefined) {
      accumulator[tokenAccount.token_id] = [];
    }
    accumulator[tokenAccount.token_id]?.push(tokenAccount);
    return accumulator;
  }, newTokenHolderDatesByMint);

  // this any[] should probably be replaced by a real type once this API isn't just a placeholder anymore
  const tokenAccountsTransactions: any[] = await knex(
    "tracked_token_account_transactions"
  )
    .join(
      "tracked_token_accounts",
      "tracked_token_accounts.id",
      "tracked_token_account_transactions.tracked_token_account_id"
    )
    .select("tracked_token_accounts.token_id", "datetime", "transfer_in")
    .count("transaction_hash as count")
    .groupBy("tracked_token_accounts.token_id", "datetime", "transfer_in")
    .orderBy("datetime");
  const tokenAccountsTransactionsByMint: { [key: number]: Object[] } = {};
  tokenAccountsTransactions.reduce((accumulator, tokenAccount) => {
    if (accumulator[tokenAccount.token_id] === undefined) {
      accumulator[tokenAccount.token_id] = [];
    }
    accumulator[tokenAccount.token_id]?.push(tokenAccount);
    return accumulator;
  }, tokenAccountsTransactionsByMint);

  // calling/processing token account balances one mint at a time since that's probably how it'd be called in
  // real life, but no reason we couldn't do multiple at a time with the same logic if needed
  const nonZeroBalancesByMintEntries = await Promise.all(
    tokenAccountMints.map(async (mint) => {
      // this read could be more efficient/require less processing - see note in tracked_token_accounts.ts about
      // inserting/caching TrackedTokenAccountBalances
      const tokenAccountBalances: TrackedTokenAccountBalance[] =
        await knex<TrackedTokenAccountBalance>("tracked_token_account_balances")
          .select(
            "tracked_token_account_id",
            "datetime",
            "approximate_minimum_balance"
          )
          .join(
            "tracked_token_accounts",
            "tracked_token_accounts.id",
            "tracked_token_account_balances.tracked_token_account_id"
          )
          .where("tracked_token_accounts.token_id", "=", mint.id!)
          .orderBy("datetime");

      if (tokenAccountBalances.length == 0) {
        return [mint.id, {}];
      }

      // {datetime (as iso string): {tracked_token_account_id: balance}}
      const balancesByDate: {
        [key: string]: { [key: string]: string };
      } = {};
      let previousDate = undefined;
      let currentDate = tokenAccountBalances[0]!.datetime;
      let i = 0;

      // this processing logic assumes the tracked_token_account_balances are sorted by date
      while (i < tokenAccountBalances.length && currentDate < new Date()) {
        // deep copy the array from previousDate's balances
        balancesByDate[currentDate.toISOString()] =
          previousDate === undefined
            ? {}
            : {
                ...balancesByDate[previousDate.toISOString()],
              };

        // now insert the day's into account_balances_by_date (which will update any balances that have changed)
        // (use <= instead of == just in case some rows got inserted on non day boundaries)
        while (
          i < tokenAccountBalances.length &&
          tokenAccountBalances[i]!.datetime <= currentDate
        ) {
          const account = tokenAccountBalances[i]!;

          balancesByDate[currentDate.toISOString()]![
            account.tracked_token_account_id
          ] = account.approximate_minimum_balance;
          i++;
        }

        // make sure to step one day at a time so that we copy over the balances even on days with 0 TrackedTokenAccountBalances
        previousDate = currentDate;
        currentDate = new Date(currentDate.valueOf() + 24 * 3600 * 1000);
      }

      // now just count the accounts with balance > 0 (we couldn't filter them out in the sql query since
      // we need to capture times when an account goes from non-zero -> zero)
      const nonZeroCountByDateEntries = Object.entries(balancesByDate).map(
        (entry) => {
          const dateString = entry[0];
          const nonZeroCount = Object.values(entry[1]).filter(
            (balance) => parseInt(balance) > 0
          ).length;
          return [dateString, nonZeroCount];
        }
      );

      // convert back to {dateString: count} dictionary
      const nonZeroCountByDate = Object.fromEntries(nonZeroCountByDateEntries);

      // return this as a dict entry
      return [mint.id, nonZeroCountByDate];
    })
  );

  const nonZeroBalancesByMint = Object.fromEntries(
    nonZeroBalancesByMintEntries
  );

  return res.json({
    message: "RLY Rewards!",
    liquidity_pools: accounts.map((account) => {
      return {
        id: account.id,
        collateral_token_account: new PublicKey(
          account.collateral_token_account
        ).toString(),
      };
    }),
    liquidity_balances_by_account: liquidityPoolBalancesByAccount,
    tracked_tokens: tokenAccountMints,
    new_token_holder_dates_by_mint: newTokenHolderDatesByMint,
    non_zero_balances_by_mint: nonZeroBalancesByMint,
    tracked_token_account_transactions_by_mint: tokenAccountsTransactionsByMint,
  });
});

routes.get("/vanity_metrics", async (_req, res) => {
  const allTrackedTokens = await knex<TrackedToken>("tracked_tokens");
  const allLiquidityCollateralTokens = await knex<LiquidityCollateralToken>(
    "liquidity_collateral_tokens"
  );

  const [
    totalWalletCount,
    walletByDayData,
    transactionCount,
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

  res.json({
    totalTokensTracked: allTrackedTokens.length,
    totalWallets: totalWalletCount,
    walletsByDay: walletByDayData,
    activeWalletsByDay: activeWalletsByDay,
    totalActiveWallets: activeWalletsTotal,
    totalTransactions: transactionCount,
    transactionsByDay: transactionsByDayData,
    tvl: tvl,
    tvlByDay: tvlByDay,
  });
});

export default routes;
