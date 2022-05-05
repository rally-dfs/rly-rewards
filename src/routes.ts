import { PublicKey } from "@solana/web3.js";
import { Router } from "express";
import { getKnex } from "./database";
import { TBCAccount } from "./types/tbc_accounts";

const routes = Router();

const knex = getKnex();

routes.get("/", async (req, res) => {
  const accounts = await knex<TBCAccount>("tbc_accounts").select();

  return res.json({
    message: "RLY Rewards!",
    accounts: accounts.map((account) =>
      new PublicKey(account.token_a_account_address).toString()
    ),
  });
});

export default routes;
