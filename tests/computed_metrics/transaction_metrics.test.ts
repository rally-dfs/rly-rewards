import { expect } from "chai";
import { getKnex } from "../../src/database";
import { TokenAccountMint } from "../../src/knex-types/token_account_mint";
import { createAccount, createTrackedToken } from "../factories";
import { totalTransactions } from "../../src/computed_metrics/transaction_metrics";

const knex = getKnex();

describe("#totalTransactions", () => {
  let trackedToken: TokenAccountMint;
  beforeEach(async () => {
    trackedToken = await createTrackedToken("sRLY", Uint8Array.from([1]));
  });

  it("returns the total count of transactions involving the given tracked tokens", async () => {
    const account1 = await createAccount(trackedToken, new Date("2022-05-20"));
    const account2 = await createAccount(trackedToken, new Date("2022-05-21"));

    await knex("token_account_transactions").insert([
      {
        token_account_id: account1.id,
        datetime: new Date("2022-05-20"),
        transaction_hash: Uint8Array.from([1]),
        transfer_in: true,
      },
      {
        token_account_id: account2.id,
        datetime: new Date("2022-05-21"),
        transaction_hash: Uint8Array.from([2]),
        transfer_in: false,
      },
    ]);

    expect(await totalTransactions([trackedToken])).to.equal("2");
  });

  it("supports combining transaction counts for multiple supplied tokens of interest", async () => {
    const trackedToken2 = await createTrackedToken(
      "Taki",
      Uint8Array.from([2])
    );

    const account1 = await createAccount(trackedToken, new Date("2022-05-20"));
    const account2 = await createAccount(trackedToken2, new Date("2022-05-21"));

    await knex("token_account_transactions").insert([
      {
        token_account_id: account1.id,
        datetime: new Date("2022-05-20"),
        transaction_hash: Uint8Array.from([1]),
        transfer_in: true,
      },
      {
        token_account_id: account2.id,
        datetime: new Date("2022-05-21"),
        transaction_hash: Uint8Array.from([2]),
        transfer_in: false,
      },
    ]);

    expect(await totalTransactions([trackedToken, trackedToken2])).to.equal(
      "2"
    );
  });

  it("ignores transactions for tokens we aren't interested in", async () => {
    const trackedToken2 = await createTrackedToken(
      "Taki",
      Uint8Array.from([2])
    );

    const account1 = await createAccount(trackedToken, new Date("2022-05-20"));
    const account2 = await createAccount(trackedToken2, new Date("2022-05-21"));

    await knex("token_account_transactions").insert([
      {
        token_account_id: account1.id,
        datetime: new Date("2022-05-20"),
        transaction_hash: Uint8Array.from([1]),
        transfer_in: true,
      },
      {
        token_account_id: account2.id,
        datetime: new Date("2022-05-21"),
        transaction_hash: Uint8Array.from([2]),
        transfer_in: false,
      },
    ]);

    expect(await totalTransactions([trackedToken])).to.equal("1");
  });

  it("supports filtering out transactions prior to a given start date", async () => {
    const account1 = await createAccount(trackedToken, new Date("2022-05-20"));
    const account2 = await createAccount(trackedToken, new Date("2022-05-21"));

    await knex("token_account_transactions").insert([
      {
        token_account_id: account1.id,
        datetime: new Date("2022-05-20"),
        transaction_hash: Uint8Array.from([1]),
        transfer_in: true,
      },
      {
        token_account_id: account2.id,
        datetime: new Date("2022-05-21"),
        transaction_hash: Uint8Array.from([2]),
        transfer_in: false,
      },
    ]);

    expect(
      await totalTransactions([trackedToken], {
        startDate: new Date("2022-05-21"),
      })
    ).to.equal("1");
  });
});
