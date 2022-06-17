import { expect } from "chai";
import request from "supertest";
import app from "../src/app";

describe("GET /", () => {
  it("returns a payload containing all data we've collected", async () => {
    const response = await request(app).get("/");

    expect(response.status).to.equal(200);
    expect(response.body).to.eql({
      message: "RLY Rewards!",
      liquidity_pools: [],
      liquidity_balances_by_account: {},
      tracked_tokens: [],
      new_token_holder_dates_by_mint: {},
      non_zero_balances_by_mint: {},
      tracked_token_account_transactions_by_mint: {},
    });
  });
});

describe("GET /vanity_metrics", () => {
  it("returns a JSON payload of dynamically computed vanity metrics", async () => {
    const response = await request(app).get("/vanity_metrics");

    expect(response.status).to.eql(200);
    expect(response.body).to.eql({
      totalTokensTracked: 0,
      totalWallets: "0",
      walletsByDay: [],
      totalActiveWallets: "0",
      activeWalletsByDay: [],
      totalTransactions: 0,
      transactionsByDay: [],
      tvl: 0,
      tvlByDay: [],
    });
  });
});
