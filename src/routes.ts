import { Router } from "express";

const routes = Router();

routes.get("/", (req, res) => {
  return res.json({ message: "RLY Rewards!" });
});

export default routes;
