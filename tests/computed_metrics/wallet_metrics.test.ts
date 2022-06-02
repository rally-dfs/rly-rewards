import { expect } from "chai";
import { getKnex } from "../../src/database";
import { TrackedToken } from "../../src/knex-types/tracked_token";
import {
  totalWallets,
  totalWalletsByDay,
} from "../../src/computed_metrics/wallet_metrics";
import { createAccount, createTrackedToken } from "../factories";

const knex = getKnex();

describe("Computed Wallet Metrics", () => {
  let trackedToken: TrackedToken;
  beforeEach(async () => {
    trackedToken = await createTrackedToken("sRLY", "fake_address_1");
  });
  describe("#totalWallets", () => {
    it("returns the total number of wallets that exist for the given minted Token", async () => {
      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(
        trackedToken,
        new Date("2022-05-21")
      );

      await knex("tracked_token_account_balances").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          approximate_minimum_balance: 0,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          approximate_minimum_balance: 10,
        },
      ]);

      expect(await totalWallets([trackedToken])).to.equal("2");
    });

    it("supports combining wallet counts for multiple supplied tokens of interest", async () => {
      const trackedToken2 = await createTrackedToken("Taki", "fake_address_2");

      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(
        trackedToken2,
        new Date("2022-05-21")
      );

      await knex("tracked_token_account_balances").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          approximate_minimum_balance: 10,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          approximate_minimum_balance: 10,
        },
      ]);

      expect(await totalWallets([trackedToken, trackedToken2])).to.equal("2");
    });

    it("filters out 0 balance wallets when passed function option flag", async () => {
      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(
        trackedToken,
        new Date("2022-05-21")
      );

      await knex("tracked_token_account_balances").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          approximate_minimum_balance: 0,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          approximate_minimum_balance: 10,
        },
      ]);

      expect(
        await totalWallets([trackedToken], {
          removeEmptyWallets: true,
        })
      ).to.equal("1");
    });

    it("does not include the same wallet address more than once per token type", async () => {
      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );

      await knex("tracked_token_account_balances").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          approximate_minimum_balance: 10,
        },
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-21"),
          approximate_minimum_balance: 10,
        },
      ]);

      expect(await totalWallets([trackedToken])).to.equal("1");
    });

    it("supports removing balances that existed prior to a given optional start date", async () => {
      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(
        trackedToken,
        new Date("2022-05-21")
      );

      await knex("tracked_token_account_balances").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          approximate_minimum_balance: 10,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          approximate_minimum_balance: 10,
        },
      ]);

      expect(
        await totalWallets([trackedToken], {
          startDate: new Date("2022-05-21"),
        })
      ).to.equal("1");
    });
  });

  describe("#totalWalletsByDay", () => {
    it("returns the total number of unique wallets by day for the given tracked tokens", async () => {
      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(
        trackedToken,
        new Date("2022-05-21")
      );

      await knex("tracked_token_account_balances").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          approximate_minimum_balance: 0,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          approximate_minimum_balance: 10,
        },
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-21"),
          approximate_minimum_balance: 0,
        },
      ]);

      expect(await totalWalletsByDay([trackedToken])).to.eql([
        {
          date: "2022-05-20T00:00:00.000Z",
          walletCount: 1,
        },
        {
          date: "2022-05-21T00:00:00.000Z",
          walletCount: 2,
        },
      ]);
    });

    it("can ignore wallets for tokens we aren't interested in", async () => {
      const token2 = await createTrackedToken("foobar", "fake_address_2");
      const account1 = await createAccount(
        trackedToken,
        new Date("2022-05-20")
      );
      const account2 = await createAccount(token2, new Date("2022-05-21"));

      await knex("tracked_token_account_balances").insert([
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-20"),
          approximate_minimum_balance: 0,
        },
        {
          tracked_token_account_id: account2.id,
          datetime: new Date("2022-05-21"),
          approximate_minimum_balance: 10,
        },
        {
          tracked_token_account_id: account1.id,
          datetime: new Date("2022-05-21"),
          approximate_minimum_balance: 0,
        },
      ]);

      expect(await totalWalletsByDay([trackedToken])).to.eql([
        {
          date: "2022-05-20T00:00:00.000Z",
          walletCount: 1,
        },
        {
          date: "2022-05-21T00:00:00.000Z",
          walletCount: 1,
        },
      ]);
    });
  });
});
