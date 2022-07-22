import { expect } from "chai";
import { getKnex } from "../../src/database";
import { TrackedToken } from "../../src/knex-types/tracked_token";
import { createAccount, createTrackedToken } from "../factories";
import {
  rlyRewardsDistributedByWeek,
  totalRLYRewardsDistributed,
} from "../../src/computed_metrics/rewards_distributed";
import { TrackedTokenAccount } from "../../src/knex-types/tracked_token_account";

const knex = getKnex();

describe("Rewards distributed", () => {
  let rlyRewardsAccount: TrackedTokenAccount;
  let otherAccount: TrackedTokenAccount;

  beforeEach(async () => {
    const trackedToken = await createTrackedToken("RLY", "fake_address_1", 18);

    rlyRewardsAccount = await createAccount(
      trackedToken,
      new Date("2022-06-01"),
      "0xe75ed5295c13d224036feb6439db7539fe6d7ce8" // hardcoded RLY rewards address
    );
    otherAccount = await createAccount(trackedToken, new Date("2022-06-01"));
  });

  describe("Total rewards distributed", () => {
    it("returns data from the latest balance of RLY rewards wallet", async () => {
      await knex("tracked_token_account_balances").insert([
        {
          tracked_token_account_id: otherAccount.id,
          datetime: new Date("2022-06-21"),
          approximate_minimum_balance: "1000" + "0".repeat(18),
        },
        {
          tracked_token_account_id: rlyRewardsAccount.id,
          datetime: new Date("2022-06-20"),
          approximate_minimum_balance: "7505269799" + "6" + "0".repeat(17), // 200.4 less than starting balance
        },
        {
          tracked_token_account_id: rlyRewardsAccount.id,
          datetime: new Date("2022-06-19"),
          approximate_minimum_balance: "7505269900" + "0".repeat(18), // 100 less than starting balance
        },
      ]);

      // should use the most recent rlyRewardsAccount balance, and not use otherAccount (and round to the nearest int)
      expect(await totalRLYRewardsDistributed()).to.equal(200);
    });

    it("handles no balances in db yet", async () => {
      // this ideally shouldn't happen but make sure we just return undefined instead of dying
      expect(await totalRLYRewardsDistributed()).to.equal(undefined);
    });
  });

  describe("Rewards distributed by week", () => {
    beforeEach(async () => {
      // insert some balances for otherAccount to make sure we correctly ignore those
      await knex("tracked_token_account_balances").insert(
        [...Array(20).keys()].map((i) => ({
          tracked_token_account_id: otherAccount.id,
          datetime: new Date(`2022-06-${10 + i}T00:00:00Z`),
          approximate_minimum_balance: i * 100 + "0".repeat(18),
        }))
      );
    });

    it("returns weekly data", async () => {
      const dayToBalances = {
        "03": "105",
        "04": "100", // handle a partial week of data
        // 2022-06-06 is week start monday
        "06": "100", // handle no change all week
        "07": "100",
        "08": "100",
        "09": "100",
        "10": "100",
        "11": "100",
        "12": "100",
        // 2022-06-13 is week start monday
        "13": "97", // handle change at beginning of week
        "14": "97",
        "15": "97",
        "16": "97",
        "17": "97",
        "18": "97",
        "19": "97",
        // 2022-06-20 is week start monday
        "20": "97",
        "21": "97",
        "22": "97",
        "23": "97",
        "24": "97",
        "25": "97",
        "26": "92", // handle change at end of week
        // 2022-06-27 is a monday
        "27": "91",
        "28": "90",
        "29": "89",
        "30": "88", // handle multiple changes throughout week (with partial data)
      };

      await knex("tracked_token_account_balances").insert(
        Object.entries(dayToBalances).map(([dayString, balanceString]) => ({
          tracked_token_account_id: rlyRewardsAccount.id,
          datetime: new Date(`2022-06-${dayString}T00:00:00Z`),
          approximate_minimum_balance: balanceString + "0".repeat(18),
        }))
      );

      expect(await rlyRewardsDistributedByWeek()).to.eql([
        { weekStart: new Date("2022-06-06T00:00:00Z"), amount: 0 },
        { weekStart: new Date("2022-06-13T00:00:00Z"), amount: 3 },
        { weekStart: new Date("2022-06-20T00:00:00Z"), amount: 5 },
        { weekStart: new Date("2022-06-27T00:00:00Z"), amount: 4 },
      ]);
    });

    it("handles 0 weeks of data in db", async () => {
      expect(await rlyRewardsDistributedByWeek()).to.eql(undefined);
    });

    it("handles only 1 week of data in db", async () => {
      const dayToBalances = {
        "03": "105",
        "04": "100",
      };

      await knex("tracked_token_account_balances").insert(
        Object.entries(dayToBalances).map(([dayString, balanceString]) => ({
          tracked_token_account_id: rlyRewardsAccount.id,
          datetime: new Date(`2022-06-${dayString}T00:00:00Z`),
          approximate_minimum_balance: balanceString + "0".repeat(18),
        }))
      );
      expect(await rlyRewardsDistributedByWeek()).to.eql(undefined);
    });

    it("handles missing week of data in db", async () => {
      // same as happy path test except with 6/13 week missing
      const dayToBalances = {
        "03": "105",
        "04": "100", // handle a partial week of data
        // 2022-06-06 is week start monday
        "06": "100", // handle no change all week
        "07": "100",
        "08": "100",
        "09": "100",
        "10": "100",
        "11": "100",
        "12": "100",
        // 2022-06-13 is week start monday (week of missing data)

        // 2022-06-20 is week start monday
        "20": "97",
        "21": "97",
        "22": "97",
        "23": "97",
        "24": "97",
        "25": "97",
        "26": "92", // handle change at end of week
        // 2022-06-27 is a monday
        "27": "91",
        "28": "90",
        "29": "89",
        "30": "88", // handle multiple changes throughout week (with partial data)
      };

      await knex("tracked_token_account_balances").insert(
        Object.entries(dayToBalances).map(([dayString, balanceString]) => ({
          tracked_token_account_id: rlyRewardsAccount.id,
          datetime: new Date(`2022-06-${dayString}T00:00:00Z`),
          approximate_minimum_balance: balanceString + "0".repeat(18),
        }))
      );

      // should just skip the following week if we're missing the previous week of data
      expect(await rlyRewardsDistributedByWeek()).to.eql([
        { weekStart: new Date("2022-06-06T00:00:00Z"), amount: 0 },
        { weekStart: new Date("2022-06-27T00:00:00Z"), amount: 4 },
      ]);
    });
  });
});
