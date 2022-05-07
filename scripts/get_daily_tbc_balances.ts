import { getKnex, closeKnexConnection } from "../src/database";
import { PublicKey } from "@solana/web3.js";
import { TBCAccountBalance } from "../src/knex-types/tbc_accounts";
import { getDailyTokenBalancesBetweenDates } from "../src/chain-data-utils/combinedQueries";

/** Calls getDailyTokenBalancesBetweenDates for all TBCAccounts. Note that the date is always interpreted as 00:00 UTC
 * for consistency (i.e. you can't pass a specific time, only dates)
 *
 * arg 1 is earliestEndDate to fetch
 * arg 2 is latestEndDate to fetch
 *
 * e.g. $ npm run get-daily-tbc-balances 2022-04-26 2022-05-05
 *
 * TODO: this should be moved to a cron to get called every day but just using script to test
 */
const main = async () => {
  const knex = getKnex();

  const earliestEndDateString = process.argv[2]; // first argument in command line is earliestEndDate
  const latestEndDateString = process.argv[3]; // first argument in command line is earliestEndDate

  const earliestEndDate = new Date(`${earliestEndDateString}T00:00:00Z`);
  const latestEndDate = new Date(`${latestEndDateString}T00:00:00Z`);

  const allAccounts: {
    tbc_account_id: number;
    token_a_account_address: string;
    token_a_account_owner_address: string;
    mint_address: string;
    decimals: number;
  }[] = await knex("tbc_accounts")
    .join("token_mints", "tbc_accounts.token_a_mint_id", "token_mints.id")
    .select(
      "tbc_accounts.id as tbc_account_id",
      "tbc_accounts.token_a_account_address",
      "tbc_accounts.token_a_account_owner_address",
      "token_mints.mint_address",
      "token_mints.decimals"
    );

  // TODO: we could optimize this by also seeing what balance data is already in the DB and skipping those dates
  // (and adding a --force flag to override)

  for (let i = 0; i < allAccounts.length; i++) {
    const account = allAccounts[i]!;
    console.log(
      `==== Fetching balances for account ${new PublicKey(
        account.token_a_account_address
      ).toString()} ====`
    );

    try {
      const tokenBalanceDates = await getDailyTokenBalancesBetweenDates(
        new PublicKey(account.token_a_account_address).toString(),
        new PublicKey(account.token_a_account_owner_address).toString(),
        new PublicKey(account.mint_address).toString(),
        earliestEndDate,
        latestEndDate,
        account.decimals
      );

      const result = await knex<TBCAccountBalance>("tbc_account_balances")
        .insert(
          tokenBalanceDates.map((balanceDate) => {
            return {
              tbc_account_id: account.tbc_account_id,
              datetime: balanceDate.dateExclusive,
              balance: balanceDate.balance,
            };
          }),
          "*" // need this for postgres to return the added result
        )
        .onConflict(["tbc_account_id", "datetime"])
        .merge(); // just update the balance if there's a conflict

      console.log(
        `Inserted balances for ${new PublicKey(
          account.token_a_account_address
        ).toString()}, pks ${result.map((res) => res.id)}`
      );
    } catch (error) {
      console.log("Error fetching account", account, error);
    }
  }

  console.log(`Done fetching all balances`);

  closeKnexConnection();
};

main();
