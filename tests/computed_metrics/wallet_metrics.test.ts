import { fail } from "assert";
import { expect } from "chai";
import { getKnex } from "../../src/database";
import { TokenAccount } from "../../src/knex-types/token_account";
import { TokenAccountMint } from "../../src/knex-types/token_account_mint";
import { totalWallets } from "../../src/computed_metrics/wallet_metrics";

const knex = getKnex();

async function mintToken(displayName: string, address: Uint8Array) {
  const mintedTokens = await knex<TokenAccountMint>(
    "token_account_mints"
  ).insert(
    {
      mint_address: address,
      display_name: displayName,
      decimals: 8,
    },
    "*"
  );
  if (mintedTokens.length < 1) {
    fail("Unable to initialize token mint");
  }

  return mintedTokens[0];
}

async function createAccount(
  mintedToken: TokenAccountMint,
  date: Date
): Promise<TokenAccount> {
  const fakeAddressSeed = Math.round(Math.random() * 100);
  const dbResponse = await knex<TokenAccount>("token_accounts").insert(
    {
      address: Uint8Array.from([fakeAddressSeed]),
      owner_address: Uint8Array.from([fakeAddressSeed]),
      mint_id: mintedToken.id,
      first_transaction_date: date,
    },
    "*"
  );
  return dbResponse[0];
}

describe("#totalWallets", () => {
  let mintedToken: TokenAccountMint;
  beforeEach(async () => {
    mintedToken = await mintToken("sRLY", Uint8Array.from([1]));
  });

  it("returns the total number of wallets that exist for the given minted Token", async () => {
    const account1 = await createAccount(mintedToken, new Date("2022-05-20"));
    const account2 = await createAccount(mintedToken, new Date("2022-05-21"));

    await knex("token_account_balances").insert([
      {
        token_account_id: account1.id,
        datetime: new Date("2022-05-20"),
        approximate_minimum_balance: 0,
      },
      {
        token_account_id: account2.id,
        datetime: new Date("2022-05-21"),
        approximate_minimum_balance: 10,
      },
    ]);

    expect(await totalWallets([mintedToken])).to.equal("2");
  });

  it("supports combining wallet counts for multiple supplied tokens of interest", async () => {
    const mintedToken2 = await mintToken("Taki", Uint8Array.from([2]));

    const account1 = await createAccount(mintedToken, new Date("2022-05-20"));
    const account2 = await createAccount(mintedToken2, new Date("2022-05-21"));

    await knex("token_account_balances").insert([
      {
        token_account_id: account1.id,
        datetime: new Date("2022-05-20"),
        approximate_minimum_balance: 10,
      },
      {
        token_account_id: account2.id,
        datetime: new Date("2022-05-21"),
        approximate_minimum_balance: 10,
      },
    ]);

    expect(await totalWallets([mintedToken, mintedToken2])).to.equal("2");
  });

  it("filters out 0 balance wallets when passed function option flag", async () => {
    const account1 = await createAccount(mintedToken, new Date("2022-05-20"));
    const account2 = await createAccount(mintedToken, new Date("2022-05-21"));

    await knex("token_account_balances").insert([
      {
        token_account_id: account1.id,
        datetime: new Date("2022-05-20"),
        approximate_minimum_balance: 0,
      },
      {
        token_account_id: account2.id,
        datetime: new Date("2022-05-21"),
        approximate_minimum_balance: 10,
      },
    ]);

    expect(
      await totalWallets([mintedToken], {
        removeEmptyWallets: true,
      })
    ).to.equal("1");
  });

  it("does not include the same wallet address more than once per token type", async () => {
    const account1 = await createAccount(mintedToken, new Date("2022-05-20"));

    await knex("token_account_balances").insert([
      {
        token_account_id: account1.id,
        datetime: new Date("2022-05-20"),
        approximate_minimum_balance: 10,
      },
      {
        token_account_id: account1.id,
        datetime: new Date("2022-05-21"),
        approximate_minimum_balance: 10,
      },
    ]);

    expect(await totalWallets([mintedToken])).to.equal("1");
  });

  it("supports removing balances that existed prior to a given optional start date", async () => {
    const account1 = await createAccount(mintedToken, new Date("2022-05-20"));
    const account2 = await createAccount(mintedToken, new Date("2022-05-21"));

    await knex("token_account_balances").insert([
      {
        token_account_id: account1.id,
        datetime: new Date("2022-05-20"),
        approximate_minimum_balance: 10,
      },
      {
        token_account_id: account2.id,
        datetime: new Date("2022-05-21"),
        approximate_minimum_balance: 10,
      },
    ]);

    expect(
      await totalWallets([mintedToken], { startDate: new Date("2022-05-21") })
    ).to.equal("1");
  });
});
