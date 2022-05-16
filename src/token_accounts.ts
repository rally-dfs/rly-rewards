import { getKnex } from "./database";
import { PublicKey } from "@solana/web3.js";
import { getAllTokenAccountInfoAndTransactions } from "./chain-data-utils/combinedQueries";
import {
  TokenAccount,
} from "./knex-types/token_account";
import bs58 from "bs58";
import { TokenAccountBalance } from "./knex-types/token_account_balance";
import { TokenAccountTransaction } from "./knex-types/token_account_transaction";

// TODO: there's currently no bulk version of this call since it's so large, it must be run one day at a time. It'd
// be useful to have one similar to tbc_accounts.getAllDailyTokenBalancesSinceLastFetch, we'd need to get max(datetime)
// across all token_account_transactions to figure out when the last successful run per mint was, and then call
// getAllTokenAccountInfoAndTransactionsForEndDate in a loop

/** Calls getAllTokenAccountInfoAndTransactions for all token accounts from `end date minus 24 hours` (inclusive)
 * to `end date` (exclusive).
 * Note that the date is always interpreted as 00:00 UTC for consistency (i.e. you can't pass a specific time,
 * only dates, that's why they're accepted as strings)
 *
 * @param endDateString
 */
export async function getAllTokenAccountInfoAndTransactionsForEndDate(
  endDateString: string
) {
  const knex = getKnex();

  const endDateExclusive = new Date(`${endDateString}T00:00:00Z`);
  const startDateInclusive = new Date(
    endDateExclusive.valueOf() - 24 * 3600 * 1000
  );

  // TODO: this is a pretty huge query, it's mostly needed to map token_address => ids when inserting into
  // token_account_balances and token_account_transactions below but we could probably avoid this if we did more
  // some complex insert queries , e.g. with a subtable and something looking like this (psuedo code)
  // `WITH values_subtable ... INSERT INTO token_account_balances SELECT ... FROM token_accounts JOIN values_subtable`
  const allTokenAccounts: {
    mint_id: number;
    mint_address: Uint8Array;
    decimals: number;
    account_id: number;
    account_address: Uint8Array;
  }[] = await knex("token_account_mints")
    .leftJoin(
      "token_accounts",
      "token_account_mints.id",
      "token_accounts.mint_id"
    )
    .select(
      "token_account_mints.id as mint_id",
      "token_account_mints.mint_address",
      "token_account_mints.decimals",
      "token_accounts.id as account_id",
      "token_accounts.address as account_address"
    );

  // {mint_id: {address: "...", accounts: {account_address: account_id}}}
  // make a dictionary to quickly look up info by mint and account PKs for below
  let tokenAccountsByMint: {
    [key: string]: {
      mint_address: string;
      decimals: number;
      accounts: { [key: string]: string };
    };
  } = {};
  allTokenAccounts.forEach((account) => {
    if (tokenAccountsByMint[account.mint_id] === undefined) {
      tokenAccountsByMint[account.mint_id] = {
        mint_address: new PublicKey(account.mint_address).toString(),
        decimals: account.decimals,
        accounts: {},
      };
    }

    // if the mint has 0 accounts, then this row will have a `null` account
    if (account.account_id) {
      tokenAccountsByMint[account.mint_id]!.accounts[
        new PublicKey(account.account_address).toString()
      ] = account.account_id.toString();
    }
  });

  const allMintIds = Object.keys(tokenAccountsByMint);

  for (let i = 0; i < allMintIds.length; i++) {
    const mintId = allMintIds[i]!;
    const mintAddress = tokenAccountsByMint[mintId]!.mint_address;
    const decimals = tokenAccountsByMint[mintId]!.decimals;
    const accountsMap = tokenAccountsByMint[mintId]!.accounts!;

    const accountInfos = await getAllTokenAccountInfoAndTransactions(
      mintAddress,
      decimals,
      startDateInclusive,
      endDateExclusive
    );

    // first insert all the TokenAccounts
    const tokenAccountsResults = await knex<TokenAccount>("token_accounts")
      .insert(
        accountInfos.map((accountInfo) => {
          return {
            address: new PublicKey(accountInfo.tokenAccountAddress).toBytes(),
            owner_address: accountInfo.ownerAccountAddress
              ? new PublicKey(accountInfo.ownerAccountAddress).toBytes()
              : undefined,
            mint_id: parseInt(mintId),
            first_transaction_date: endDateExclusive,
          };
        }),
        "*" // need this for postgres to return the added result
      )
      .onConflict(["address"])
      // update first_transaction_date if endDateExclusive is further in the past (i.e. if we called this for a date
      // backwards in time than the existing data)
      .merge({ first_transaction_date: endDateExclusive })
      .where("token_accounts.first_transaction_date", ">", endDateExclusive);

    // update accountsMap with the newly added items (tokenAccountResults doesn't include the already existing
    // rows that weren't inserted)
    const updatedAccountsMap = tokenAccountsResults.reduce(
      (accountsMap, result) => {
        accountsMap[new PublicKey(result.address).toString()] =
          result.id!.toString();
        return accountsMap;
      },
      accountsMap
    );

    const filteredAccountInfos = accountInfos.filter((accountInfo) => {
      if (!updatedAccountsMap[accountInfo.tokenAccountAddress]) {
        // this shouldn't ever happen, means something with the above merging logic went wrong
        console.error(
          "updatedAccountsMap missing address",
          accountInfo.tokenAccountAddress
        );
        return false;
      }
      return true;
    });

    // next insert all the TokenAccountBalances
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
          token_account_id: parseInt(
            updatedAccountsMap[accountInfo.tokenAccountAddress]!
          ),
          datetime: endDateExclusive,
          approximate_minimum_balance: accountInfo.approximateMinimumBalance,
        };
      });

    if (tokenAccountBalancesRows.length > 0) {
      await knex<TokenAccountBalance>("token_account_balances")
        .insert(
          tokenAccountBalancesRows,
          "*" // need this for postgres to return the added result
        )
        .onConflict(["token_account_id", "datetime"])
        .merge(); // just update the balance if there's a conflict
    }

    // finally, insert the TokenAccountTransactions
    const incomingTransactionRows: TokenAccountTransaction[] = [];
    const outgoingTransactionRows: TokenAccountTransaction[] = [];

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
            token_account_id: parseInt(
              updatedAccountsMap[accountInfo.tokenAccountAddress]!
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
            token_account_id: parseInt(
              updatedAccountsMap[accountInfo.tokenAccountAddress]!
            ),
            datetime: endDateExclusive,
            transaction_hash: hash!,
            transfer_in: false,
          };
        })
      );
    });

    if (incomingTransactionRows.length > 0) {
      await knex<TokenAccountTransaction>("token_account_transactions")
        .insert(
          incomingTransactionRows,
          "*" // need this for postgres to return the added result
        )
        .onConflict(["token_account_id", "transaction_hash"])
        .ignore(); // can just ignore if we already have this account saved
    }

    if (outgoingTransactionRows.length > 0) {
      await knex<TokenAccountTransaction>("token_account_transactions")
        .insert(
          outgoingTransactionRows,
          "*" // need this for postgres to return the added result
        )
        .onConflict(["token_account_id", "transaction_hash"])
        .ignore(); // can just ignore if we already have this account saved
    }
  }
}
