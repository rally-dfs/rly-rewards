import { expect } from "chai";
import request from "supertest";
import app from "../src/app";

import { stub } from "sinon";
import * as offchain_hardcoded from "../src/computed_metrics/offchain_hardcoded";

describe("GET /vanity_metrics", () => {
  it("returns a JSON payload of dynamically computed vanity metrics", async () => {
    // ignore hardcoded data for this test
    const offchainStub = stub(offchain_hardcoded, "getOffchainHardcodedData");
    offchainStub.returns({
      totalTransactionCount: 0,
      totalWalletCount: 0,
      tvl: 0,
    });

    const response = await request(app).get("/vanity_metrics");

    offchainStub.restore();

    expect(response.status).to.eql(200);
    expect(response.body).to.eql({
      totalTokensTracked: 0,
      totalWallets: 0,
      walletsByDay: [],
      totalTransactions: 0,
      transactionsByDay: [],
      tvl: 0,
      tvlByDay: [],
    });
  });

  it("takes offchain hardcoded metrics into account", async () => {
    const response = await request(app).get("/vanity_metrics");

    expect(response.status).to.eql(200);
    // this has to be updated if we update the hardcoded numbers, but probably not a bad idea to have a
    // secondary check here in the tests
    expect(response.body).to.eql({
      totalTokensTracked: 0,
      totalWallets: 774_600,
      walletsByDay: [],
      totalTransactions: 20_775_850,
      transactionsByDay: [],
      tvl: 129_536_000,
      tvlByDay: [],
    });
  });
});
