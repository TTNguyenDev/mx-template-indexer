import { Config } from "src/common/config";
// import * as PairCron from "./pairs/";
import { Connection } from "typeorm";

const cron = require("node-cron"); // eslint-disable-line

export async function startCrons(config: Config, conn: Connection) {
  /// Sample
  // cron.schedule("*/5 * * * *", async () =>
  //   new PairCron.PairStatisticsCron(config, conn).run(),
  // );
}
