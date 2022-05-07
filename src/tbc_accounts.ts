import { getKnex } from "./database";
import { PublicKey } from "@solana/web3.js";
import { TBCAccountBalance } from "./knex-types/tbc_accounts";
import { getDailyTokenBalancesBetweenDates } from "./chain-data-utils/combinedQueries";

/** Calls getDailyTokenBalancesBetweenDates for all token accounts, starting from the last date whose balance we have */
export async function getAllDailyTokenBalancesSinceLastFetch() {
  const knex = getKnex();

  // get the max(datetime) grouped by token accounts
  const accountLatestDates: { tbc_account_id: number; latest_date: Date }[] =
    await knex("tbc_account_balances")
      .select("tbc_account_id")
      .max("datetime as latest_date")
      .groupBy("tbc_account_id");

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

    // wait ~48 hours from today to be safe, sometimes the solana/bitquery APIs are behind (could maybe cut this down
    // if we really want, need to investigate a bit exactly how long it takes)
    const latestEndDate = new Date(new Date().valueOf() - 48 * 3600 * 1000);

    await getDailyTokenBalances(
      earliestEndDate.toISOString().substring(0, 10),
      latestEndDate.toISOString().substring(0, 10),
      [accountLatestDate.tbc_account_id]
    );
  }
}

/** Calls getDailyTokenBalancesBetweenDates for specific TBCAccounts. Note that the date is always interpreted as 00:00 UTC
 * for consistency (i.e. you can't pass a specific time, only dates, that's why they're accepted as strings)
 *
 * @argument earliestEndDateString earliest endDate to fetch (inclusive), as a string. e.g. "2022-04-01"
 * @argument latestEndDateString latest endDate to fetch (inclusive), as a string, e.g. "2022-05-01"
 * @argument tbcAccountIds ids of TBCAccounts to fetch. Fetches all accounts if undefined
 */
export async function getDailyTokenBalances(
  earliestEndDateString: string,
  latestEndDateString: string,
  tbcAccountIds?: number[]
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

  let query = knex("tbc_accounts")
    .join("token_mints", "tbc_accounts.token_a_mint_id", "token_mints.id")
    .select(
      "tbc_accounts.id as tbc_account_id",
      "tbc_accounts.token_a_account_address",
      "tbc_accounts.token_a_account_owner_address",
      "token_mints.mint_address",
      "token_mints.decimals"
    );

  if (tbcAccountIds !== undefined) {
    query = query.whereIn("tbc_accounts.id", tbcAccountIds);
  }

  const allAccounts: {
    tbc_account_id: number;
    token_a_account_address: string;
    token_a_account_owner_address: string;
    mint_address: string;
    decimals: number;
  }[] = await query;

  // TODO: we could optimize this by also seeing what balance data is already in the DB and skipping those dates
  // (and adding a --force flag to override)

  for (let i = 0; i < allAccounts.length; i++) {
    const account = allAccounts[i]!;
    console.log(
      `==== Fetching balances for account ${new PublicKey(
        account.token_a_account_address
      ).toString()} from ${earliestEndDate} to ${latestEndDate} ====`
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
}
