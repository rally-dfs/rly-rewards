import { expect } from "chai";
import request from "supertest";
import app from "../src/app";

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
