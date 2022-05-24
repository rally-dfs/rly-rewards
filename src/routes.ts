import { PublicKey } from "@solana/web3.js";
import { Router } from "express";
import { getKnex } from "./database";
import { TBCAccount } from "./knex-types/tbc_account";
import { TBCAccountBalance } from "./knex-types/tbc_account_balance";
import { TokenAccountBalance } from "./knex-types/token_account_balance";
import { TokenAccountMint } from "./knex-types/token_account_mint";

const routes = Router();

const knex = getKnex();

routes.get("/", async (_req, res) => {
  // this is all just a placeholder to show the data, we would probably split these into dedicated
  // APIs based on the frontend UI (plus the return formats are all inconsistent right now)
  const accounts = await knex<TBCAccount>("tbc_accounts").select();

  const tbcAccountBalances = await knex<TBCAccountBalance>(
    "tbc_account_balances"
  )
    .select()
    .orderBy("datetime");
  const tbcAccountBalancesByAccount: { [key: number]: TBCAccountBalance[] } =
    {};
  tbcAccountBalances.reduce((accumulator, accountBalance) => {
    if (accumulator[accountBalance.tbc_account_id] === undefined) {
      accumulator[accountBalance.tbc_account_id] = [];
    }
    accumulator[accountBalance.tbc_account_id]?.push(accountBalance);
    return accumulator;
  }, tbcAccountBalancesByAccount);

  const tokenAccountMints = (
    await knex<TokenAccountMint>("token_account_mints").select()
  ).map((mint) => {
    return {
      id: mint.id,
      mint_address: new PublicKey(mint.mint_address).toString(),
      decimals: mint.decimals,
    };
  });

  // this any[] should probably be replaced by a real type once this API isn't just a placeholder anymore
  const newTokenAccounts: any[] = await knex("token_accounts")
    .select("mint_id", "first_transaction_date")
    .count("address as count")
    .groupBy("first_transaction_date", "mint_id")
    .orderBy("first_transaction_date");
  const newTokenAccountsByMint: { [key: number]: Object[] } = {};
  newTokenAccounts.reduce((accumulator, tokenAccount) => {
    if (accumulator[tokenAccount.mint_id] === undefined) {
      accumulator[tokenAccount.mint_id] = [];
    }
    accumulator[tokenAccount.mint_id]?.push(tokenAccount);
    return accumulator;
  }, newTokenAccountsByMint);

  // this any[] should probably be replaced by a real type once this API isn't just a placeholder anymore
  const tokenAccountsTransactions: any[] = await knex(
    "token_account_transactions"
  )
    .join(
      "token_accounts",
      "token_accounts.id",
      "token_account_transactions.token_account_id"
    )
    .select("token_accounts.mint_id", "datetime", "transfer_in")
    .count("transaction_hash as count")
    .groupBy("token_accounts.mint_id", "datetime", "transfer_in")
    .orderBy("datetime");
  const tokenAccountsTransactionsByMint: { [key: number]: Object[] } = {};
  tokenAccountsTransactions.reduce((accumulator, tokenAccount) => {
    if (accumulator[tokenAccount.mint_id] === undefined) {
      accumulator[tokenAccount.mint_id] = [];
    }
    accumulator[tokenAccount.mint_id]?.push(tokenAccount);
    return accumulator;
  }, tokenAccountsTransactionsByMint);

  // calling/processing token account balances one mint at a time since that's probably how it'd be called in
  // real life, but no reason we couldn't do multiple at a time with the same logic if needed
  const nonZeroBalancesByMintEntries = await Promise.all(
    tokenAccountMints.map(async (mint) => {
      // this read could be more efficient/require less processing - see note in token_accounts.ts about
      // inserting/caching TokenAccountBalances
      const tokenAccountBalances: TokenAccountBalance[] =
        await knex<TokenAccountBalance>("token_account_balances")
          .select("token_account_id", "datetime", "approximate_minimum_balance")
          .join(
            "token_accounts",
            "token_accounts.id",
            "token_account_balances.token_account_id"
          )
          .where("token_accounts.mint_id", "=", mint.id!)
          .orderBy("datetime");

      if (tokenAccountBalances.length == 0) {
        return [mint.id, {}];
      }

      // {datetime (as iso string): {token_account_id: balance}}
      const balancesByDate: {
        [key: string]: { [key: string]: number };
      } = {};
      let previousDate = undefined;
      let currentDate = tokenAccountBalances[0]!.datetime;
      let i = 0;

      // this processing logic assumes the token_account_balances are sorted by date
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

          balancesByDate[currentDate.toISOString()]![account.token_account_id] =
            account.approximate_minimum_balance;
          i++;
        }

        // make sure to step one day at a time so that we copy over the balances even on days with 0 TokenAccountBalances
        previousDate = currentDate;
        currentDate = new Date(currentDate.valueOf() + 24 * 3600 * 1000);
      }

      // now just count the accounts with balance > 0 (we couldn't filter them out in the sql query since
      // we need to capture times when an account goes from non-zero -> zero)
      const nonZeroCountByDateEntries = Object.entries(balancesByDate).map(
        (entry) => {
          const dateString = entry[0];
          const nonZeroCount = Object.values(entry[1]).filter(
            (balance) => balance > 0
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
    tbc_accounts: accounts.map((account) => {
      return {
        id: account.id,
        token_a_account_address: new PublicKey(
          account.token_a_account_address
        ).toString(),
      };
    }),
    tbc_balances_by_account: tbcAccountBalancesByAccount,
    token_account_mints: tokenAccountMints,
    new_token_accounts_by_mint: newTokenAccountsByMint,
    non_zero_balances_by_mint: nonZeroBalancesByMint,
    token_account_transactions_by_mint: tokenAccountsTransactionsByMint,
  });
});

export default routes;
