import { getKnex } from "./database";

import { TrackedTokenAccount } from "./knex-types/tracked_token_account";
import { TrackedTokenAccountBalance } from "./knex-types/tracked_token_account_balance";
import { TrackedTokenAccountTransaction } from "./knex-types/tracked_token_account_transaction";
import { TrackedTokenAccountBalanceChange } from "./knex-types/tracked_token_account_balance_change";
import { TrackedTokenChain } from "./knex-types/tracked_token";

import { TrackedTokenAccountInfo } from "./chain-data-utils/bq_tracked_token_base";
import { getAllSolanaTrackedTokenAccountInfoAndTransactions } from "./chain-data-utils/bq_tracked_token_sol";
import { getAllEthTokenAddressInfoAndTransactions } from "./chain-data-utils/bq_tracked_token_eth";

/** Calls getAllTrackedTokenAccountInfoAndTransactions for all token accounts from `previously fetched end date + 24 hours`
 * (inclusive) to `end date` (exclusive).
 * Note that the date is always interpreted as 00:00 UTC for consistency (i.e. you can't pass a specific time,
 * only dates, that's why they're accepted as strings)
 *
 * @param lastEndDateString
 * @param forceOneDay if true, will get 24 hours of data instead of getting data from the previously fetched end date
 */
export async function getAllTrackedTokenAccountInfoAndTransactionsForEndDate(
  lastEndDateString: string,
  forceOneDay: boolean
) {
  const knex = getKnex();

  const lastEndDate = new Date(`${lastEndDateString}T00:00:00Z`);

  // TODO: this is a pretty huge query, it's mostly needed to map token_address => ids when inserting into
  // tracked_token_account_balances and tracked_token_account_transactions below but we could probably avoid this if we did more
  // some complex insert queries , e.g. with a subtable and something looking like this (psuedo code)
  // `WITH values_subtable ... INSERT INTO tracked_token_account_balances SELECT ... FROM tracked_token_accounts JOIN values_subtable`
  const allTrackedTokenAccounts: {
    token_id: number;
    mint_address: string;
    decimals: number;
    chain: TrackedTokenChain;
    account_id: number;
    account_address: string;
  }[] = await knex("tracked_tokens")
    .leftJoin(
      "tracked_token_accounts",
      "tracked_tokens.id",
      "tracked_token_accounts.token_id"
    )
    .select(
      "tracked_tokens.id as token_id",
      "tracked_tokens.mint_address",
      "tracked_tokens.decimals",
      "tracked_tokens.chain",
      "tracked_token_accounts.id as account_id",
      "tracked_token_accounts.address as account_address"
    );

  // {token_id: {address: "...", decimals: 9, chain: "solana", accountIdsByAddress: {account_address: account_id}}}
  // make a dictionary to quickly look up info by mint and account PKs for below
  let tokenAccountsByToken: {
    [key: string]: {
      mint_address: string;
      decimals: number;
      chain: TrackedTokenChain;
      accountIdsByAddress: { [key: string]: string };
    };
  } = {};
  allTrackedTokenAccounts.forEach((account) => {
    if (tokenAccountsByToken[account.token_id] === undefined) {
      tokenAccountsByToken[account.token_id] = {
        mint_address: account.mint_address,
        decimals: account.decimals,
        chain: account.chain,
        accountIdsByAddress: {},
      };
    }

    // if the mint has 0 accounts, then this row will have a `null` account
    if (account.account_id) {
      tokenAccountsByToken[account.token_id]!.accountIdsByAddress[
        account.account_address
      ] = account.account_id.toString();
    }
  });

  const allTrackedTokenIds = Object.keys(tokenAccountsByToken);

  const mostRecentBalances: {
    tracked_token_account_id: number;
    approximate_minimum_balance: string;
    datetime: Date;
    token_id: number;
  }[] = await knex("tracked_token_account_balances")
    .join(
      "tracked_token_accounts",
      "tracked_token_accounts.id",
      "tracked_token_account_balances.tracked_token_account_id"
    )
    .distinctOn("tracked_token_account_id")
    .select(
      "tracked_token_account_id",
      "approximate_minimum_balance",
      "datetime",
      "tracked_token_accounts.token_id"
    )
    .where("datetime", "<", lastEndDate)
    .orderBy([
      { column: "tracked_token_account_id" },
      { column: "datetime", order: "desc" },
    ]);

  // {token_id: {date_string: {account_id: balance}}}
  const balancesByDateByTokenId: {
    [key: string]: {
      [key: string]: { [key: string]: string };
    };
  } = {};
  mostRecentBalances.forEach((balance) => {
    const dateString = balance.datetime.toISOString();

    if (balancesByDateByTokenId[balance.token_id] === undefined) {
      balancesByDateByTokenId[balance.token_id] = {};
    }

    if (balancesByDateByTokenId[balance.token_id]![dateString] === undefined) {
      balancesByDateByTokenId[balance.token_id]![dateString] = {};
    }

    balancesByDateByTokenId[balance.token_id]![dateString]![
      balance.tracked_token_account_id
    ] = balance.approximate_minimum_balance;
  });

  for (let i = 0; i < allTrackedTokenIds.length; i++) {
    const tokenId = allTrackedTokenIds[i]!;
    const mintAddress = tokenAccountsByToken[tokenId]!.mint_address;
    const decimals = tokenAccountsByToken[tokenId]!.decimals;
    const chain = tokenAccountsByToken[tokenId]!.chain;
    const accountIdsByAddress =
      tokenAccountsByToken[tokenId]!.accountIdsByAddress!;

    // just use an empty object {} for the very first data fetch for this token
    const balancesByDate = balancesByDateByTokenId[tokenId] || {};

    // at this point there should only be at most one date_string key for the most recent date (unless something went
    // wrong previously, i.e. for some `date`, some accounts got an updated balance row but others didn't).
    // we'll update this in-memory dictionary with more days' data if we're fetching multiple days in the loop below
    if (Object.keys(balancesByDate).length > 1) {
      console.error(
        `Data inconsistency for tracked token ${tokenId}, multiple "most recent dates" available: ${Object.keys(
          balancesByDate
        )}`
      );
      continue; // better to bail on this token here instead of trying to fetch data on top of partially incorrect data
    }

    // if we have some past data (and the `forceOneDay` flag is off), start with day + 1.
    // otherwise just start with lastEndDate and do one iteration
    const maxDate = Object.keys(balancesByDate)[0]
      ? new Date(Object.keys(balancesByDate)[0]!)
      : undefined;
    const maxDatePlusOne = maxDate
      ? new Date(
          new Date(
            // truncate to day boundary (just in case there's some inconsistent data in maxDate)
            `${maxDate?.toISOString().substring(0, 10)}T00:00:00Z`
          ).valueOf() +
            24 * 3600 * 1000
        )
      : undefined;

    let currentEndDate =
      maxDatePlusOne && !forceOneDay ? maxDatePlusOne : lastEndDate;

    console.log(`Fetching tracked token data for ${tokenId} ${mintAddress}`);

    while (currentEndDate <= lastEndDate) {
      await _getTrackedTokenAccountInfoForMintAndEndDate(
        tokenId,
        mintAddress,
        decimals,
        chain,
        accountIdsByAddress,
        balancesByDate,
        currentEndDate
      );

      currentEndDate = new Date(currentEndDate.valueOf() + 24 * 3600 * 1000);
    }
  }
}

/** Helper function that fetches account info for `end date minus 24 hours` to `endDate` and inserts into DB.
 * Would need to refactor better to make it usable externally (it currently requires some specific set up/data
 * prefetching)
 *
 * @param tokenId
 * @param mintAddress
 * @param decimals
 * @param chain
 * @param accountIdsByAddress Dictionary of {account_address: db_id}. Will be updated with any new accounts fetched and
 * inserted into the DB during this run (needed for future calls of this function)
 * @param balancesByDate Dictionary of {date: {account_id: balance}}. Will be updated with `endDateExclusive`'s
 * new balance data (needed for future calls of this function)
 * @param endDateExclusive
 */
async function _getTrackedTokenAccountInfoForMintAndEndDate(
  tokenId: string,
  mintAddress: string,
  decimals: number,
  chain: TrackedTokenChain,
  accountIdsByAddress: { [key: string]: string },
  balancesByDate: { [key: string]: { [key: string]: string } },
  endDateExclusive: Date
) {
  const knex = getKnex();

  // from testing, there's a ~10K row insert limit, split the inserts into chunks in case there's too many (probably
  // would mostly only happen with transactions)
  const chunkSize = 10000;

  const startDateInclusive = new Date(
    endDateExclusive.valueOf() - 24 * 3600 * 1000
  );

  let accountInfos: TrackedTokenAccountInfo[];
  if (chain === "solana") {
    accountInfos = await getAllSolanaTrackedTokenAccountInfoAndTransactions(
      mintAddress,
      decimals,
      startDateInclusive,
      endDateExclusive
    );
  } else if (chain === "ethereum") {
    accountInfos = await getAllEthTokenAddressInfoAndTransactions(
      mintAddress,
      decimals,
      startDateInclusive,
      endDateExclusive
    );
  } else {
    console.error(`Invalid chain set for tracked token ${tokenId}: ${chain}`);
    return;
  }

  if (accountInfos.length > 0) {
    // first insert any new TrackedTokenAccounts
    const tokenAccounts = accountInfos.map((accountInfo) => {
      return {
        address: accountInfo.tokenAccountAddress,
        owner_address: accountInfo.ownerAccountAddress,
        token_id: parseInt(tokenId),
        first_transaction_date: endDateExclusive,
      };
    });

    for (let i = 0; i < tokenAccounts.length; i += chunkSize) {
      const tokenAccountsResults = await knex<TrackedTokenAccount>(
        "tracked_token_accounts"
      )
        .insert(
          tokenAccounts.slice(i, i + chunkSize),
          "*" // need this for postgres to return the added result
        )
        .onConflict(["address", "token_id"])
        // update first_transaction_date if endDateExclusive is further in the past (i.e. if we called this for a date
        // backwards in time than the existing data)
        .merge({ first_transaction_date: endDateExclusive })
        .where(
          "tracked_token_accounts.first_transaction_date",
          ">",
          endDateExclusive
        );

      // update accountsMap with the newly added items (tokenAccountResults doesn't include the already existing
      // rows that weren't inserted)
      tokenAccountsResults.reduce((accountsMap, result) => {
        accountsMap[result.address] = result.id!.toString();
        return accountsMap;
      }, accountIdsByAddress);
    }
  }

  const filteredAccountInfos = accountInfos.filter((accountInfo) => {
    if (!accountIdsByAddress[accountInfo.tokenAccountAddress]) {
      // this shouldn't ever happen, means something with the above merging logic went wrong
      console.error(
        "updated accountsMap missing address",
        accountInfo.tokenAccountAddress
      );
      return false;
    }
    return true;
  });

  // next insert all the TrackedTokenAccountBalances and TrackedTokenAccountBalanceChanges
  const tokenAccountBalanceChangesRows = filteredAccountInfos
    .filter((accountInfo) => {
      // balance might be missing if something went wrong with on chain fetch, just skip
      return accountInfo.approximateMinimumBalance !== undefined;
    })
    .map((accountInfo) => {
      return {
        tracked_token_account_id: parseInt(
          accountIdsByAddress[accountInfo.tokenAccountAddress]!
        ),
        datetime: endDateExclusive,
        approximate_minimum_balance: accountInfo.approximateMinimumBalance,
      };
    });

  if (tokenAccountBalanceChangesRows.length > 0) {
    for (let i = 0; i < tokenAccountBalanceChangesRows.length; i += chunkSize) {
      await knex<TrackedTokenAccountBalanceChange>(
        "tracked_token_account_balance_changes"
      )
        .insert(
          tokenAccountBalanceChangesRows.slice(i, i + chunkSize),
          "*" // need this for postgres to return the added result
        )
        .onConflict(["tracked_token_account_id", "datetime"])
        .merge(); // just update the balance if there's a conflict
    }
  }

  // TrackedTokenAccountBalances:
  // copy previous day's balances into a new dict (we could instead do whatever most recent date has any data for a
  // given account, but seems cleaner to not skip days if there's some bug causing missing days/accounts, easier to just
  // copy no data for the day and manually investigate than to partially update the day)
  const currentDayBalances = {
    ...(balancesByDate[startDateInclusive.toISOString()] || {}),
  };

  // update with new balances from current day and write that into TrackedTokenAccountBalance
  filteredAccountInfos.forEach((accountInfo) => {
    if (accountInfo.approximateMinimumBalance !== undefined) {
      currentDayBalances[
        accountIdsByAddress[accountInfo.tokenAccountAddress]!
      ] = accountInfo.approximateMinimumBalance;
    }
  });

  const tokenAccountBalancesRows = Object.entries(currentDayBalances).map(
    ([accountId, balance]) => ({
      tracked_token_account_id: parseInt(accountId),
      datetime: endDateExclusive,
      approximate_minimum_balance: balance,
    })
  );

  if (tokenAccountBalancesRows.length > 0) {
    for (let i = 0; i < tokenAccountBalancesRows.length; i += chunkSize) {
      await knex<TrackedTokenAccountBalance>("tracked_token_account_balances")
        .insert(
          tokenAccountBalancesRows.slice(i, i + chunkSize),
          "*" // need this for postgres to return the added result
        )
        .onConflict(["tracked_token_account_id", "datetime"])
        .merge(); // just update the balance if there's a conflict
    }
  }

  // update balancesByDay (just needed if we're calling this function for multiple days at once)
  balancesByDate[endDateExclusive.toISOString()] = currentDayBalances;

  // finally, insert the TrackedTokenAccountTransactions
  const incomingTransactionRows: TrackedTokenAccountTransaction[] = [];
  const outgoingTransactionRows: TrackedTokenAccountTransaction[] = [];

  filteredAccountInfos.forEach((accountInfo) => {
    incomingTransactionRows.push(
      ...Object.values(accountInfo.incomingTransactions).map((txn) => {
        return {
          tracked_token_account_id: parseInt(
            accountIdsByAddress[accountInfo.tokenAccountAddress]!
          ),
          datetime: endDateExclusive,
          transaction_datetime: txn.transaction_datetime,
          transaction_hash: txn.hash,
          amount: txn.amount,
          transfer_in: true,
        };
      })
    );

    outgoingTransactionRows.push(
      ...Object.values(accountInfo.outgoingTransactions).map((txn) => {
        return {
          tracked_token_account_id: parseInt(
            accountIdsByAddress[accountInfo.tokenAccountAddress]!
          ),
          datetime: endDateExclusive,
          transaction_datetime: txn.transaction_datetime,
          transaction_hash: txn.hash,
          amount: txn.amount,
          transfer_in: false,
        };
      })
    );
  });

  if (incomingTransactionRows.length > 0) {
    for (let i = 0; i < incomingTransactionRows.length; i += chunkSize) {
      await knex<TrackedTokenAccountTransaction>(
        "tracked_token_account_transactions"
      )
        .insert(
          incomingTransactionRows.slice(i, i + chunkSize),
          "*" // need this for postgres to return the added result
        )
        .onConflict([
          "tracked_token_account_id",
          "transaction_hash",
          "transfer_in",
        ])
        .ignore(); // can just ignore if we already have this account saved
    }
  }

  if (outgoingTransactionRows.length > 0) {
    for (let i = 0; i < outgoingTransactionRows.length; i += chunkSize) {
      await knex<TrackedTokenAccountTransaction>(
        "tracked_token_account_transactions"
      )
        .insert(
          outgoingTransactionRows.slice(i, i + chunkSize),
          "*" // need this for postgres to return the added result
        )
        .onConflict([
          "tracked_token_account_id",
          "transaction_hash",
          "transfer_in",
        ])
        .ignore(); // can just ignore if we already have this account saved
    }
  }
}
