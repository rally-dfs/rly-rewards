import express from "express";
import routes from "./routes";
import { initCron } from "./cron";

class App {
  public server;

  constructor() {
    this.server = express();

    this.middlewares();
    this.routes();

    initCron();
  }

  middlewares() {
    this.server.use(express.json());
  }

  routes() {
    this.server.use(routes);
  }
}

export default new App().server;
