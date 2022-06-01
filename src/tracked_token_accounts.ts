import { getKnex } from "./database";
import { PublicKey } from "@solana/web3.js";
import { getAllTrackedTokenAccountInfoAndTransactions } from "./chain-data-utils/combined_queries";
import { TrackedTokenAccount } from "./knex-types/tracked_token_account";
import bs58 from "bs58";
import { TrackedTokenAccountBalance } from "./knex-types/tracked_token_account_balance";
import { TrackedTokenAccountTransaction } from "./knex-types/tracked_token_account_transaction";

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

  // TODO: this is a pretty huge query, it's mostly needed to map token_address => ids when inserting into
  // tracked_token_account_balances and tracked_token_account_transactions below but we could probably avoid this if we did more
  // some complex insert queries , e.g. with a subtable and something looking like this (psuedo code)
  // `WITH values_subtable ... INSERT INTO tracked_token_account_balances SELECT ... FROM tracked_token_accounts JOIN values_subtable`
  const allTrackedTokenAccounts: {
    token_id: number;
    mint_address: Uint8Array;
    decimals: number;
    account_id: number;
    account_address: Uint8Array;
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
      "tracked_token_accounts.id as account_id",
      "tracked_token_accounts.address as account_address"
    );

  // {token_id: {address: "...", accounts: {account_address: account_id}}}
  // make a dictionary to quickly look up info by mint and account PKs for below
  let tokenAccountsByMint: {
    [key: string]: {
      mint_address: string;
      decimals: number;
      accounts: { [key: string]: string };
    };
  } = {};
  allTrackedTokenAccounts.forEach((account) => {
    if (tokenAccountsByMint[account.token_id] === undefined) {
      tokenAccountsByMint[account.token_id] = {
        mint_address: new PublicKey(account.mint_address).toString(),
        decimals: account.decimals,
        accounts: {},
      };
    }

    // if the mint has 0 accounts, then this row will have a `null` account
    if (account.account_id) {
      tokenAccountsByMint[account.token_id]!.accounts[
        new PublicKey(account.account_address).toString()
      ] = account.account_id.toString();
    }
  });

  const allMintIds = Object.keys(tokenAccountsByMint);

  const maxDateByMintId: { token_id: number; max_datetime: Date }[] =
    await knex("tracked_token_account_transactions")
      .join(
        "tracked_token_accounts",
        "tracked_token_accounts.id",
        "tracked_token_account_transactions.tracked_token_account_id"
      )
      .select("tracked_token_accounts.token_id")
      .where("datetime", "<", lastEndDateString)
      .max("datetime as max_datetime")
      .groupBy("tracked_token_accounts.token_id");

  for (let i = 0; i < allMintIds.length; i++) {
    const mintId = allMintIds[i]!;
    const mintAddress = tokenAccountsByMint[mintId]!.mint_address;
    const decimals = tokenAccountsByMint[mintId]!.decimals;
    const accountsMap = tokenAccountsByMint[mintId]!.accounts!;

    const lastEndDate = new Date(`${lastEndDateString}T00:00:00Z`);

    // if we have some past data (and the `forceOneDay` flag is off), start with day + 1.
    // otherwise just start with lastEndDate and do one iteration
    const maxDate = maxDateByMintId.find(
      (value) => value.token_id === parseInt(mintId)
    )?.max_datetime;
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

    while (currentEndDate <= lastEndDate) {
      await _getTrackedTokenAccountInfoForMintAndEndDate(
        mintId,
        mintAddress,
        decimals,
        accountsMap,
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
 * @param mintId
 * @param mintAddress
 * @param decimals
 * @param accountsMap
 * @param endDateExclusive
 */
async function _getTrackedTokenAccountInfoForMintAndEndDate(
  mintId: string,
  mintAddress: string,
  decimals: number,
  accountsMap: { [key: string]: string },
  endDateExclusive: Date
) {
  const knex = getKnex();

  // from testing, there's a ~10K row insert limit, split the inserts into chunks in case there's too many (probably
  // would mostly only happen with transactions)
  const chunkSize = 10000;

  const startDateInclusive = new Date(
    endDateExclusive.valueOf() - 24 * 3600 * 1000
  );

  const accountInfos = await getAllTrackedTokenAccountInfoAndTransactions(
    mintAddress,
    decimals,
    startDateInclusive,
    endDateExclusive
  );

  if (accountInfos.length == 0) {
    return;
  }

  // first insert all the TrackedTokenAccounts
  const tokenAccounts = accountInfos.map((accountInfo) => {
    return {
      address: new PublicKey(accountInfo.tokenAccountAddress).toBytes(),
      owner_address: accountInfo.ownerAccountAddress
        ? new PublicKey(accountInfo.ownerAccountAddress).toBytes()
        : undefined,
      token_id: parseInt(mintId),
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
      .onConflict(["address"])
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
      accountsMap[new PublicKey(result.address).toString()] =
        result.id!.toString();
      return accountsMap;
    }, accountsMap);
  }

  const filteredAccountInfos = accountInfos.filter((accountInfo) => {
    if (!accountsMap[accountInfo.tokenAccountAddress]) {
      // this shouldn't ever happen, means something with the above merging logic went wrong
      console.error(
        "updated accountsMap missing address",
        accountInfo.tokenAccountAddress
      );
      return false;
    }
    return true;
  });

  // next insert all the TrackedTokenAccountBalances
  // TODO: currently if day_n has a row and day_n+1 has no row, it implies the balance is unchanged
  // this makes reading "what was balance on x date" less efficient - if it becomes a problem we could probably
  // just create a new denormalized table that stores the daily counts of non-zero balance accounts or something
  const tokenAccountBalancesRows = filteredAccountInfos
    .filter((accountInfo) => {
      // balance is optional due to solana.fm flakiness so just skip those rows if they don't exist
      return accountInfo.approximateMinimumBalance !== undefined;
    })
    .map((accountInfo) => {
      return {
        tracked_token_account_id: parseInt(
          accountsMap[accountInfo.tokenAccountAddress]!
        ),
        datetime: endDateExclusive,
        approximate_minimum_balance: accountInfo.approximateMinimumBalance,
      };
    });

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

  // finally, insert the TrackedTokenAccountTransactions
  const incomingTransactionRows: TrackedTokenAccountTransaction[] = [];
  const outgoingTransactionRows: TrackedTokenAccountTransaction[] = [];

  filteredAccountInfos.forEach((accountInfo) => {
    // convert string => Uint8Array
    const incomingHashes = [...accountInfo.incomingTransactions]
      .map((transaction) => {
        const transactionHash = bs58.decode(transaction);
        return transactionHash.length === 64 ? transactionHash : undefined;
      })
      .filter((hash) => hash !== undefined);

    const outgoingHashes = [...accountInfo.outgoingTransactions]
      .map((transaction) => {
        const transactionHash = bs58.decode(transaction);
        return transactionHash.length === 64 ? transactionHash : undefined;
      })
      .filter((hash) => hash !== undefined);

    incomingTransactionRows.push(
      ...incomingHashes.map((hash) => {
        return {
          tracked_token_account_id: parseInt(
            accountsMap[accountInfo.tokenAccountAddress]!
          ),
          datetime: endDateExclusive,
          transaction_hash: hash!,
          transfer_in: true,
        };
      })
    );

    outgoingTransactionRows.push(
      ...outgoingHashes.map((hash) => {
        return {
          tracked_token_account_id: parseInt(
            accountsMap[accountInfo.tokenAccountAddress]!
          ),
          datetime: endDateExclusive,
          transaction_hash: hash!,
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
        .onConflict(["tracked_token_account_id", "transaction_hash"])
        .ignore(); // can just ignore if we already have this account saved
    }
  }

  if (outgoingTransactionRows.length > 0) {
    for (let i = 0; i < incomingTransactionRows.length; i += chunkSize) {
      await knex<TrackedTokenAccountTransaction>(
        "tracked_token_account_transactions"
      )
        .insert(
          outgoingTransactionRows.slice(i, i + chunkSize),
          "*" // need this for postgres to return the added result
        )
        .onConflict(["tracked_token_account_id", "transaction_hash"])
        .ignore(); // can just ignore if we already have this account saved
    }
  }
}
