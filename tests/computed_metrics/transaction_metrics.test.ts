import { expect } from "chai";
import { getKnex } from "../../src/database";
import { TrackedToken } from "../../src/knex-types/tracked_token";
import { createAccount, createTrackedToken } from "../factories";
import {
  totalTransactions,
  transactionsByDay,
} from "../../src/computed_metrics/transaction_metrics";
import { TrackedTokenAccount } from "../../src/knex-types/tracked_token_account";

const knex = getKnex();

describe("Transaction Computed Metrics", () => {
  let trackedToken: TrackedToken;
  beforeEach(async () => {
    trackedToken = await createTrackedToken("sRLY", "fake_address_1");
  });

  describe("#totalTransactions", () => {
    it("returns the total count of transactions involving the given tracked tokens", async () => {
      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(
        trackedToken,
        new Date("2022-05-21")
      );

      await knex("tracked_token_account_transactions").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          transaction_hash: Uint8Array.from([1]),
          transfer_in: true,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          transaction_hash: Uint8Array.from([2]),
          transfer_in: false,
        },
      ]);

      expect(await totalTransactions([trackedToken])).to.equal(2);
    });

    it("supports combining transaction counts for multiple supplied tokens of interest", async () => {
      const trackedToken2 = await createTrackedToken("Taki", "fake_address_2");

      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(
        trackedToken2,
        new Date("2022-05-21")
      );

      await knex("tracked_token_account_transactions").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          transaction_hash: Uint8Array.from([1]),
          transfer_in: true,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          transaction_hash: Uint8Array.from([2]),
          transfer_in: false,
        },
      ]);

      expect(await totalTransactions([trackedToken, trackedToken2])).to.equal(
        2
      );
    });

    it("ignores transactions for tokens we aren't interested in", async () => {
      const trackedToken2 = await createTrackedToken("Taki", "fake_address_2");

      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(
        trackedToken2,
        new Date("2022-05-21")
      );

      await knex("tracked_token_account_transactions").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          transaction_hash: Uint8Array.from([1]),
          transfer_in: true,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          transaction_hash: Uint8Array.from([2]),
          transfer_in: false,
        },
      ]);

      expect(await totalTransactions([trackedToken])).to.equal(1);
    });

    it("supports filtering out transactions prior to a given start date", async () => {
      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(
        trackedToken,
        new Date("2022-05-21")
      );

      await knex("tracked_token_account_transactions").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          transaction_hash: Uint8Array.from([1]),
          transfer_in: true,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          transaction_hash: Uint8Array.from([2]),
          transfer_in: false,
        },
      ]);

      expect(
        await totalTransactions([trackedToken], {
          startDate: new Date("2022-05-21"),
        })
      ).to.equal(1);
    });
  });

  describe("transactionsByDay", () => {
    it("returns the number of transactions by day for the tokens we asked about", async () => {
      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(
        trackedToken,
        new Date("2022-05-21")
      );

      await knex("tracked_token_account_transactions").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          transaction_hash: Uint8Array.from([1]),
          transfer_in: true,
        },
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          transaction_hash: Uint8Array.from([4]),
          transfer_in: true,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-20"),
          transaction_hash: Uint8Array.from([3]),
          transfer_in: true,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          transaction_hash: Uint8Array.from([2]),
          transfer_in: false,
        },
      ]);

      expect(await transactionsByDay([trackedToken])).to.eql([
        { date: "2022-05-20T00:00:00.000Z", transactionCount: 3 },
        { date: "2022-05-21T00:00:00.000Z", transactionCount: 1 },
      ]);
    });

    it("ignores transactions from tokens we don't care about", async () => {});

    it("allows optionally setting how many days we want to return", async () => {});
  });
});
