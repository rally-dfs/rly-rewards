import * as chai from "chai";
import chaiExclude from "chai-exclude";

import { stub, SinonStub } from "sinon";
import * as queries from "../src/chain-data-utils/combined_queries";

import { getKnex } from "../src/database";
import { getAllTrackedTokenAccountInfoAndTransactionsForEndDate } from "../src/tracked_token_accounts";
import { TrackedToken } from "../src/knex-types/tracked_token";
import { TrackedTokenAccount } from "../src/knex-types/tracked_token_account";
import { TrackedTokenAccountBalance } from "../src/knex-types/tracked_token_account_balance";
import { TrackedTokenAccountTransaction } from "../src/knex-types/tracked_token_account_transaction";
import { TrackedTokenAccountBalanceChange } from "../src/knex-types/tracked_token_account_balance_change";

chai.use(chaiExclude);

const knex = getKnex();

describe("#getAllTrackedTokenAccountInfoAndTransactionsForEndDate", () => {
  let tokenId: number;
  let queriesStub: SinonStub;
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

    queriesStub = stub(
      queries,
      "getAllSolanaTrackedTokenAccountInfoAndTransactions"
    );

    // two accounts on first call (6/1)
    queriesStub.onCall(0).returns(
      Promise.resolve([
        {
          tokenAccountAddress: "account1",
          ownerAccountAddress: "owner1",
          approximateMinimumBalance: "10",
          incomingTransactions: new Set<string>(["txnin1"]),
          outgoingTransactions: new Set<string>(["txnout1"]),
        },
        {
          tokenAccountAddress: "account2",
          ownerAccountAddress: "owner2",
          approximateMinimumBalance: "20",
          incomingTransactions: new Set<string>(["txnin2"]),
          outgoingTransactions: new Set<string>(["txnout2"]),
        },
      ])
    );

    // one new account on second call (6/2)
    queriesStub.onCall(1).returns(
      Promise.resolve([
        {
          tokenAccountAddress: "account1",
          ownerAccountAddress: "owner1",
          approximateMinimumBalance: "0",
          incomingTransactions: new Set<string>(["txnin12"]),
          outgoingTransactions: new Set<string>(["txnout12"]),
        },
        {
          tokenAccountAddress: "account3",
          ownerAccountAddress: "owner3",
          approximateMinimumBalance: "30",
          incomingTransactions: new Set<string>(["txnin3"]),
          outgoingTransactions: new Set<string>(["txnout3"]),
        },
      ])
    );

    // one new account on third call (6/2)
    queriesStub.onCall(2).returns(
      Promise.resolve([
        {
          tokenAccountAddress: "account3",
          ownerAccountAddress: "owner3",
          approximateMinimumBalance: "300",
          incomingTransactions: new Set<string>(["txnin31"]),
          outgoingTransactions: new Set<string>(["txnout31"]),
        },
        {
          tokenAccountAddress: "account4",
          ownerAccountAddress: "owner4",
          approximateMinimumBalance: "40",
          incomingTransactions: new Set<string>(["txnin4"]),
          outgoingTransactions: new Set<string>(["txnout4"]),
        },
      ])
    );
  });

  afterEach(async () => {
    queriesStub.restore();
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
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnin2",
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnout1",
            transfer_in: false,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnout2",
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
      queriesStub.restore();
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
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnin2",
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnout1",
            transfer_in: false,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account2"
            )!.id,
            datetime: new Date("2022-06-01"),
            transaction_hash: "txnout2",
            transfer_in: false,
          },
          // 6/2 transactions
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-02"),
            transaction_hash: "txnin12",
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-02"),
            transaction_hash: "txnin3",
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account1"
            )!.id,
            datetime: new Date("2022-06-02"),
            transaction_hash: "txnout12",
            transfer_in: false,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-02"),
            transaction_hash: "txnout3",
            transfer_in: false,
          },
          // 6/3 transactions
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-03"),
            transaction_hash: "txnin31",
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account4"
            )!.id,
            datetime: new Date("2022-06-03"),
            transaction_hash: "txnin4",
            transfer_in: true,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account3"
            )!.id,
            datetime: new Date("2022-06-03"),
            transaction_hash: "txnout31",
            transfer_in: false,
          },
          {
            tracked_token_account_id: tokenAccounts.find(
              (account) => account.address === "account4"
            )!.id,
            datetime: new Date("2022-06-03"),
            transaction_hash: "txnout4",
            transfer_in: false,
          },
        ]);
    });
  });
});
