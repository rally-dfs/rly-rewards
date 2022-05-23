import { expect } from "chai";
import request from "supertest";
import app from "../src/app";

describe("GET /", () => {
  it("returns a payload containing all data we've collected", async () => {
    const response = await request(app).get("/");

    expect(response.status).to.equal(200);
    expect(response.body).to.eql({
      message: "RLY Rewards!",
      tbc_accounts: [],
      tbc_balances: [],
      token_account_mints: [],
      new_token_accounts: [],
      non_zero_balances_by_mint: {},
      token_account_transactions: [],
    });
  });
});
