import { expect } from "chai";
import { getKnex } from "../../src/database";
import { TrackedToken } from "../../src/knex-types/tracked_token";
import { createAccount, createTrackedToken } from "../factories";
import { totalRLYRewardsDistributed } from "../../src/computed_metrics/rewards_distributed";
import { TrackedTokenAccount } from "../../src/knex-types/tracked_token_account";

const knex = getKnex();

describe("Total rewards distributed", () => {
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
