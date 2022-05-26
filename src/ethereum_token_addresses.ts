import { getKnex } from "./database";
import { getAllEthTokenAddressInfoAndTransactions } from "./chain-data-utils/bitquery";
import { EthereumTokenAddress } from "./knex-types/ethereum_token_address";
import { EthereumTokenAddressBalance } from "./knex-types/ethereum_token_address_balance";
import { EthereumTokenAddressTransaction } from "./knex-types/ethereum_token_address_transaction";

/** Similar to token_accounts.getAllTokenAccountInfoAndTransactionsForEndDate but for ethereum instead of solana
 * (I explored extracting all the shared read/write/looping/etc functionality into a single helper, but since they
 * use different db tables/column names/types it ended up being uglier than just copy pasting)
 *
 * Calls getAllEthTokenAddressInfoAndTransactions for all token accounts from `previously fetched end date + 24 hours`
 * (inclusive) to `end date` (exclusive).
 * Note that the date is always interpreted as 00:00 UTC for consistency (i.e. you can't pass a specific time,
 * only dates, that's why they're accepted as strings)
 *
 * @param lastEndDateString
 * @param forceOneDay if true, will get 24 hours of data instead of getting data from the previously fetched end date
 */
export async function getAllEthTokenAddressInfoAndTransactionsForEndDate(
  lastEndDateString: string,
  forceOneDay: boolean
) {
  const knex = getKnex();

  // TODO: this is a pretty huge query, it's mostly needed to map token_address => ids when inserting into
  // ethereum_token_address_balances and ethereum_token_address_transactions below but we could probably avoid this if we did more
  // some complex insert queries , e.g. with a subtable and something looking like this (psuedo code)
  // `WITH values_subtable ... INSERT INTO ethereum_token_address_balances SELECT ... FROM ethereum_token_addresses JOIN values_subtable`
  const allTokenAddresses: {
    contract_id: number;
    contract_address: string;
    decimals: number;
    address_id: number;
    account_address: string;
  }[] = await knex("ethereum_token_contracts")
    .leftJoin(
      "ethereum_token_addresses",
      "ethereum_token_contracts.id",
      "ethereum_token_addresses.contract_id"
    )
    .select(
      "ethereum_token_contracts.id as contract_id",
      "ethereum_token_contracts.address as contract_address",
      "ethereum_token_contracts.decimals",
      "ethereum_token_addresses.id as address_id",
      "ethereum_token_addresses.address as account_address"
    );

  // {contract_id: {address: "...", tokenAddresses: {account_address: address_id}}}
  // make a dictionary to quickly look up info by mint and account PKs for below
  let tokenAddressesByContract: {
    [key: string]: {
      contract_address: string;
      decimals: number;
      tokenAddresses: { [key: string]: string };
    };
  } = {};
  allTokenAddresses.forEach((tokenAddress) => {
    if (tokenAddressesByContract[tokenAddress.contract_id] === undefined) {
      tokenAddressesByContract[tokenAddress.contract_id] = {
        contract_address: tokenAddress.contract_address,
        decimals: tokenAddress.decimals,
        tokenAddresses: {},
      };
    }

    // if the mint has 0 accounts, then this row will have a `null` account
    if (tokenAddress.address_id) {
      tokenAddressesByContract[tokenAddress.contract_id]!.tokenAddresses[
        tokenAddress.account_address
      ] = tokenAddress.address_id.toString();
    }
  });

  const allContractIds = Object.keys(tokenAddressesByContract);

  const maxDateByContractId: { contract_id: number; max_datetime: Date }[] =
    await knex("ethereum_token_address_transactions")
      .join(
        "ethereum_token_addresses",
        "ethereum_token_addresses.id",
        "ethereum_token_address_transactions.token_address_id"
      )
      .select("ethereum_token_addresses.contract_id")
      .where("datetime", "<", lastEndDateString)
      .max("datetime as max_datetime")
      .groupBy("ethereum_token_addresses.contract_id");

  for (let i = 0; i < allContractIds.length; i++) {
    const contractId = allContractIds[i]!;
    const contractAddress =
      tokenAddressesByContract[contractId]!.contract_address;
    const decimals = tokenAddressesByContract[contractId]!.decimals;
    const tokenAddressesMap =
      tokenAddressesByContract[contractId]!.tokenAddresses!;

    const lastEndDate = new Date(`${lastEndDateString}T00:00:00Z`);

    // if we have some past data (and the `forceOneDay` flag is off), start with day + 1.
    // otherwise just start with lastEndDate and do one iteration
    const maxDate = maxDateByContractId.find(
      (value) => value.contract_id === parseInt(contractId)
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
      await _getEthTokenAddressInfoForMintAndEndDate(
        contractId,
        contractAddress,
        decimals,
        tokenAddressesMap,
        currentEndDate
      );

      currentEndDate = new Date(currentEndDate.valueOf() + 24 * 3600 * 1000);
    }
  }
}

/** Similar to token_accounts._getTokenAccountInfoForMintAndEndDate but for ethereum instead of solana
 *
 * Helper function that fetches account info for `end date minus 24 hours` to `endDate` and inserts into DB.
 * Would need to refactor better to make it usable externally (it currently requires some specific set up/data
 * prefetching)
 *
 * @param contractId
 * @param contractAddress
 * @param decimals
 * @param tokenAddressesMap
 * @param endDateExclusive
 */
async function _getEthTokenAddressInfoForMintAndEndDate(
  contractId: string,
  contractAddress: string,
  decimals: number,
  tokenAddressesMap: { [key: string]: string },
  endDateExclusive: Date
) {
  const knex = getKnex();

  const startDateInclusive = new Date(
    endDateExclusive.valueOf() - 24 * 3600 * 1000
  );

  const addressInfos = await getAllEthTokenAddressInfoAndTransactions(
    contractAddress,
    decimals,
    startDateInclusive,
    endDateExclusive
  );

  if (addressInfos.length == 0) {
    return;
  }

  // first insert all the EthereumTokenAddress
  const tokenAddresses = addressInfos.map((addressInfo) => {
    return {
      address: addressInfo.address,
      contract_id: parseInt(contractId),
      first_transaction_date: endDateExclusive,
    };
  });

  const tokenAddressesResults = await knex<EthereumTokenAddress>(
    "ethereum_token_addresses"
  )
    .insert(
      tokenAddresses,
      "*" // need this for postgres to return the added result
    )
    .onConflict(["address"])
    // update first_transaction_date if endDateExclusive is further in the past (i.e. if we called this for a date
    // backwards in time than the existing data)
    .merge({ first_transaction_date: endDateExclusive })
    .where(
      "ethereum_token_addresses.first_transaction_date",
      ">",
      endDateExclusive
    );

  // update tokenAddressesMap with the newly added items (tokenAddressesResults doesn't include the already existing
  // rows that weren't inserted)
  tokenAddressesResults.reduce((addressesMap, result) => {
    addressesMap[result.address] = result.id!.toString();
    return addressesMap;
  }, tokenAddressesMap);

  const filteredAddressInfos = addressInfos.filter((addressInfo) => {
    if (!tokenAddressesMap[addressInfo.address]) {
      // this shouldn't ever happen, means something with the above merging logic went wrong
      console.error(
        "updatedTokenAddressMap missing address",
        addressInfo.address
      );
      return false;
    }
    return true;
  });

  // next insert all the EthereumTokenAddressBalances
  // TODO: currently if day_n has a row and day_n+1 has no row, it implies the balance is unchanged
  // this makes reading "what was balance on x date" less efficient - if it becomes a problem we could probably
  // just create a new denormalized table that stores the daily counts of non-zero balance accounts or something
  const tokenAddressBalancesRows = filteredAddressInfos
    .filter((accountInfo) => {
      // TODO: in solana, balance is optional/flaky due to solana.fm - need to see if same thing is true for ethereum
      return accountInfo.balance !== undefined;
    })
    .map((accountInfo) => {
      return {
        token_address_id: parseInt(tokenAddressesMap[accountInfo.address]!),
        datetime: endDateExclusive,
        balance: accountInfo.balance,
      };
    });

  if (tokenAddressBalancesRows.length > 0) {
    await knex<EthereumTokenAddressBalance>("ethereum_token_address_balances")
      .insert(
        tokenAddressBalancesRows,
        "*" // need this for postgres to return the added result
      )
      .onConflict(["token_address_id", "datetime"])
      .merge(); // just update the balance if there's a conflict
  }

  // finally, insert the EthereumTokenAddressTransactions
  const incomingTransactionRows: EthereumTokenAddressTransaction[] = [];
  const outgoingTransactionRows: EthereumTokenAddressTransaction[] = [];

  filteredAddressInfos.forEach((addressInfo) => {
    // convert string => Uint8Array
    const incomingHashes = [...addressInfo.incomingTransactions]
      .map((transaction) => {
        const transactionHash = Uint8Array.from(
          Buffer.from(transaction, "hex")
        );
        return transactionHash.length === 32 ? transactionHash : undefined;
      })
      .filter((hash) => hash !== undefined);

    const outgoingHashes = [...addressInfo.outgoingTransactions]
      .map((transaction) => {
        const transactionHash = Uint8Array.from(
          Buffer.from(transaction, "hex")
        );
        return transactionHash.length === 64 ? transactionHash : undefined;
      })
      .filter((hash) => hash !== undefined);

    incomingTransactionRows.push(
      ...incomingHashes.map((hash) => {
        return {
          token_address_id: parseInt(tokenAddressesMap[addressInfo.address]!),
          datetime: endDateExclusive,
          transaction_hash: hash!,
          transfer_in: true,
        };
      })
    );

    outgoingTransactionRows.push(
      ...outgoingHashes.map((hash) => {
        return {
          token_address_id: parseInt(tokenAddressesMap[addressInfo.address]!),
          datetime: endDateExclusive,
          transaction_hash: hash!,
          transfer_in: false,
        };
      })
    );
  });

  if (incomingTransactionRows.length > 0) {
    await knex<EthereumTokenAddressTransaction>(
      "ethereum_token_address_transactions"
    )
      .insert(
        incomingTransactionRows,
        "*" // need this for postgres to return the added result
      )
      .onConflict(["token_address_id", "transaction_hash"])
      .ignore(); // can just ignore if we already have this account saved
  }

  if (outgoingTransactionRows.length > 0) {
    await knex<EthereumTokenAddressTransaction>(
      "ethereum_token_address_transactions"
    )
      .insert(
        outgoingTransactionRows,
        "*" // need this for postgres to return the added result
      )
      .onConflict(["token_address_id", "transaction_hash"])
      .ignore(); // can just ignore if we already have this account saved
  }
}
