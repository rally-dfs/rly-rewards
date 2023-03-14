import * as chai from "chai";
import chaiExclude from "chai-exclude";

import { stub, SinonStub } from "sinon";
import * as bitquery from "../src/chain-data-utils/bq_tracked_token_sol";

import { getKnex } from "../src/database";
import { getAllTrackedTokenAccountInfoAndTransactionsForEndDate } from "../src/tracked_token_accounts";
import { TrackedToken } from "../src/knex-types/tracked_token";
import { TrackedTokenAccount } from "../src/knex-types/tracked_token_account";
import { TrackedTokenAccountTransaction } from "../src/knex-types/tracked_token_account_transaction";
import { TrackedTokenAccountBalanceChange } from "../src/knex-types/tracked_token_account_balance_change";

chai.use(chaiExclude);

const knex = getKnex();

describe("#getAllTrackedTokenAccountInfoAndTransactionsForEndDate", () => {
  let tokenId: number;
  let bitqueryStub: SinonStub;
  let tokenAccounts: TrackedTokenAccount[];

  // stub out getAllSolanaTrackedTokenAccountInfoAndTransactions
  beforeEach(async () => {
    const tokenInsert = await knex<TrackedToken>("tracked_tokens").insert(
      {
        mint_address: "token_address",
        decimals: 9,
      },
      "*"
    );
    tokenId = tokenInsert[0]!.id!;

    bitqueryStub = stub(
      bitquery,
      "getAllSolanaTrackedTokenAccountInfoAndTransactions"
    );

    // two accounts on first call (6/1)
    bitqueryStub.onCall(0).returns(
      Promise.resolve([
        {
          tokenAccountAddress: "account1",
          ownerAccountAddress: "owner1",
          approximateMinimumBalance: "10",
          incomingTransactions: {
            txnin1: {
              hash: "txnin1",
              transaction_datetime: new Date("2022-01-01"),
              amount: "1.111",
            },
          },
          outgoingTransactions: {
            txnout1: {
              hash: "txnout1",
              transaction_datetime: new Date("2022-01-01"),
              amount: "1.111",
            },
          },
        },
        {
          tokenAccountAddress: "account2",
          ownerAccountAddress: "owner2",
          approximateMinimumBalance: "20",
          incomingTransactions: {
            txnin1: {
              hash: "txnin2",
              transaction_datetime: new Date("2022-02-02"),
              amount: "2.222",
            },
          },
          outgoingTransactions: {
            txnout2: {
              hash: "txnout2",
              transaction_datetime: new Date("2022-02-02"),
              amount: "2.222",
            },
          },
        },
      ])
    );

    // one new account on second call (6/2)
    bitqueryStub.onCall(1).returns(
      Promise.resolve([
        {
          tokenAccountAddress: "account1",
          ownerAccountAddress: "owner1",
          approximateMinimumBalance: "0",
          incomingTransactions: {
            txnin12: {
              hash: "txnin12",
              transaction_datetime: new Date("2022-12-12"),
              amount: "12.121212",
            },
          },
          outgoingTransactions: {
            txnout12: {
              hash: "txnout12",
              transaction_datetime: new Date("2022-12-12"),
              amount: "12.121212",
            },
          },
        },
        {
          tokenAccountAddress: "account3",
          ownerAccountAddress: "owner3",
          approximateMinimumBalance: "30",
          incomingTransactions: {
            txnin12: {
              hash: "txnin3",
              transaction_datetime: new Date("2022-03-03"),
              amount: "3.333",
            },
          },
          outgoingTransactions: {
            txnout3: {
              hash: "txnout3",
              transaction_datetime: new Date("2022-03-03"),
              amount: "3.333",
            },
          },
        },
      ])
    );

    // one new account on third call (6/2)
    bitqueryStub.onCall(2).returns(
      Promise.resolve([
        {
          tokenAccountAddress: "account3",
          ownerAccountAddress: "owner3",
          approximateMinimumBalance: "300",
          incomingTransactions: {
            txnin12: {
              hash: "txnin31",
              transaction_datetime: new Date("2022-03-01"),
              amount: "31.313131",
            },
          },
          outgoingTransactions: {
            txnout31: {
              hash: "txnout31",
              transaction_datetime: new Date("2022-03-01"),
              amount: "31.313131",
            },
          },
        },
        {
          tokenAccountAddress: "account4",
          ownerAccountAddress: "owner4",
          approximateMinimumBalance: "40",
          incomingTransactions: {
            txnin12: {
              hash: "txnin4",
              transaction_datetime: new Date("2022-04-04"),
              amount: "4.444",
            },
          },
          outgoingTransactions: {
            txnout4: {
              hash: "txnout4",
              transaction_datetime: new Date("2022-04-04"),
              amount: "4.444",
            },
          },
        },
      ])
    );
  });

  afterEach(async () => {
    bitqueryStub.restore();
  });

  describe("Call with only a single day", () => {
    beforeEach(async () => {
      // get a single day's worth of data first for 6/1
      await getAllTrackedTokenAccountInfoAndTransactionsForEndDate(
        "2022-06-01",
        true
      );

      tokenAccounts = await knex<TrackedTokenAccount>(
        "tracked_token_accounts"
      ).select("*");
    });

    it("saves tracked token accounts for single call", async () => {
      // account1 and account2 should've been added
      chai
        .expect(tokenAccounts)
        .excluding("id")
        .to.eql([
          {
            address: "account1",
            owner_address: "owner1",
            token_id: tokenId,
            first_transaction_date: new Date("2022-06-01"),
          },
          {
            address: "account2",
            owner_address: "owner2",
            token_id: tokenId,
            first_transaction_date: new Date("2022-06-01"),
          },
        ]);
    });

    // TODO: tracked_token_account_balances got too big and stopped working
    // it was less work to just remove this instead of actually removing it from all the subsequent code
    // and cleaning it up, but we should do that if we ever revive this code
    /*
    it("saves tracked token account balances for single call", async () => {
      const tokenAccountBalances = await knex<TrackedTokenAccountBalance>(
        "tracked_token_account_balances"
      ).select("*");

      chai
        .expect(tokenAccountBalances)
        .excluding("id")
        .to.eql([
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-01"),
            approximate_minimum_balance: "10",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            approximate_minimum_balance: "20",
          },
        ]);
    });
    */

    it("saves tracked token account balance changes for single call", async () => {
      // changes is basically the same as balances for the first day
      const tokenAccountBalanceChanges =
        await knex<TrackedTokenAccountBalanceChange>(
          "tracked_token_account_balance_changes"
        ).select("*");
      chai
        .expect(tokenAccountBalanceChanges)
        .excluding("id")
        .to.eql([
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-01"),
            approximate_minimum_balance: "10",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            approximate_minimum_balance: "20",
          },
        ]);
    });

    it("saves tracked token account transactions for single call", async () => {
      // txns for 6/1 should be added
      const tokenAccountTransactions =
        await knex<TrackedTokenAccountTransaction>(
          "tracked_token_account_transactions"
        ).select("*");

      chai
        .expect(tokenAccountTransactions)
        .excluding("id")
        .to.eql([
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnin1",
            amount: "1.111",
            transaction_datetime: new Date("2022-01-01"),
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnin2",
            amount: "2.222",
            transaction_datetime: new Date("2022-02-02"),
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnout1",
            amount: "1.111",
            transaction_datetime: new Date("2022-01-01"),
            transfer_in: false,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnout2",
            amount: "2.222",
            transaction_datetime: new Date("2022-02-02"),
            transfer_in: false,
          },
        ]);
    });
  });

  describe("Call for multiple days", () => {
    beforeEach(async () => {
      // get a single day's worth of data first for 6/1
      await getAllTrackedTokenAccountInfoAndTransactionsForEndDate(
        "2022-06-01",
        true
      );

      // now do a query from 6/3, which should fetch both 6/2 and 6/3 data at once
      await getAllTrackedTokenAccountInfoAndTransactionsForEndDate(
        "2022-06-03",
        false
      );

      // both 3 and 4 should be added (with correct first_transaction_dates)
      tokenAccounts = await knex<TrackedTokenAccount>(
        "tracked_token_accounts"
      ).select("*");
    });

    afterEach(async () => {
      bitqueryStub.restore();
    });

    it("saves tracked token accounts for multiple days", async () => {
      chai
        .expect(tokenAccounts)
        .excluding("id")
        .to.eql([
          {
            address: "account1",
            owner_address: "owner1",
            token_id: tokenId,
            first_transaction_date: new Date("2022-06-01"),
          },
          {
            address: "account2",
            owner_address: "owner2",
            token_id: tokenId,
            first_transaction_date: new Date("2022-06-01"),
          },
          {
            address: "account3",
            owner_address: "owner3",
            token_id: tokenId,
            first_transaction_date: new Date("2022-06-02"),
          },
          {
            address: "account4",
            owner_address: "owner4",
            token_id: tokenId,
            first_transaction_date: new Date("2022-06-03"),
          },
        ]);
    });

    // TODO: tracked_token_account_balances got too big and stopped working
    // it was less work to just remove this instead of actually removing it from all the subsequent code
    // and cleaning it up, but we should do that if we ever revive this code
    /*
    it("saves tracked token account balances for multiple days", async () => {
      // balances for 6/2 and 6/3 should be added
      const updatedTokenAccountBalances =
        await knex<TrackedTokenAccountBalance>(
          "tracked_token_account_balances"
        ).select("*");
      chai
        .expect(updatedTokenAccountBalances)
        .excluding("id")
        .to.eql([
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-01"),
            approximate_minimum_balance: "10",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            approximate_minimum_balance: "20",
          },
          // make sure 6/2 balances include the unchanged account2 from 6/1
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-02"),
            approximate_minimum_balance: "0",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-02"),
            approximate_minimum_balance: "20",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-02"),
            approximate_minimum_balance: "30",
          },
          // make sure the 6/3 balances include all previous days too
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-03"),
            approximate_minimum_balance: "0",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-03"),
            approximate_minimum_balance: "20",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-03"),
            approximate_minimum_balance: "300",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account4"
            )!.id,
            datetime: new Date("2022-06-03"),
            approximate_minimum_balance: "40",
          },
        ]);
    });
    */

    it("saves tracked token account balance changes for multiple days", async () => {
      // changes should only have the net new rows and not the unchanged ones
      const updatedTokenAccountBalanceChanges =
        await knex<TrackedTokenAccountBalanceChange>(
          "tracked_token_account_balance_changes"
        ).select("*");
      chai
        .expect(updatedTokenAccountBalanceChanges)
        .excluding("id")
        .to.eql([
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-01"),
            approximate_minimum_balance: "10",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            approximate_minimum_balance: "20",
          },
          // make sure 6/2 balances don't include the unchanged account2 from 6/1
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-02"),
            approximate_minimum_balance: "0",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-02"),
            approximate_minimum_balance: "30",
          },
          // make sure the 6/3 balances only include the new days
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-03"),
            approximate_minimum_balance: "300",
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account4"
            )!.id,
            datetime: new Date("2022-06-03"),
            approximate_minimum_balance: "40",
          },
        ]);
    });

    it("saves tracked token account transactions for multiple days", async () => {
      // txn should also be added for both 6/2 and 6/3
      const updatedTokenAccountTransactions =
        await knex<TrackedTokenAccountTransaction>(
          "tracked_token_account_transactions"
        ).select("*");
      chai
        .expect(updatedTokenAccountTransactions)
        .excluding("id")
        .to.eql([
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnin1",
            amount: "1.111",
            transaction_datetime: new Date("2022-01-01"),
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnin2",
            amount: "2.222",
            transaction_datetime: new Date("2022-02-02"),
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnout1",
            amount: "1.111",
            transaction_datetime: new Date("2022-01-01"),
            transfer_in: false,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnout2",
            amount: "2.222",
            transaction_datetime: new Date("2022-02-02"),
            transfer_in: false,
          },
          // 6/2 transactions
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-02"),
            transaction_hash: "txnin12",
            amount: "12.121212",
            transaction_datetime: new Date("2022-12-12"),
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-02"),
            transaction_hash: "txnin3",
            amount: "3.333",
            transaction_datetime: new Date("2022-03-03"),
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-02"),
            transaction_hash: "txnout12",
            amount: "12.121212",
            transaction_datetime: new Date("2022-12-12"),
            transfer_in: false,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-02"),
            transaction_hash: "txnout3",
            amount: "3.333",
            transaction_datetime: new Date("2022-03-03"),
            transfer_in: false,
          },
          // 6/3 transactions
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-03"),
            transaction_hash: "txnin31",
            amount: "31.313131",
            transaction_datetime: new Date("2022-03-01"),
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account4"
            )!.id,
            datetime: new Date("2022-06-03"),
            transaction_hash: "txnin4",
            amount: "4.444",
            transaction_datetime: new Date("2022-04-04"),
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-03"),
            transaction_hash: "txnout31",
            amount: "31.313131",
            transaction_datetime: new Date("2022-03-01"),
            transfer_in: false,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account4"
            )!.id,
            datetime: new Date("2022-06-03"),
            transaction_hash: "txnout4",
            amount: "4.444",
            transaction_datetime: new Date("2022-04-04"),
            transfer_in: false,
          },
        ]);
    });
  });
});
