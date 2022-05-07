import { PublicKey } from "@solana/web3.js";
import { Router } from "express";
import { getKnex } from "./database";
import { TBCAccount, TBCAccountBalance } from "./types/tbc_accounts";

const routes = Router();

const knex = getKnex();

routes.get("/", async (_req, res) => {
  const accounts = await knex<TBCAccount>("tbc_accounts").select();

  const tbc_account_balances = await knex<TBCAccountBalance>(
    "tbc_account_balances"
  ).select();

  return res.json({
    message: "RLY Rewards!",
    accounts: accounts.map((account) => {
      return {
        id: account.id,
        token_a_account_address: new PublicKey(
          account.token_a_account_address
        ).toString(),
      };
    }),
    balances: tbc_account_balances.map((balance) => {
      return {
        id: balance.id,
        account_id: balance.tbc_account_id,
        date: balance.datetime,
        balance: balance.balance,
      };
    }),
  });
});

export default routes;
