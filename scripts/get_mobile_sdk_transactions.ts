import { closeKnexConnection } from "../src/database";
import { getMobileSDKTransactions } from "../src/mobile_sdk";

/** Calls getMobileSDKTransactions for a block range
 *
 * arg 1 is the first block to fetch from, inclusive. If "last", will fetch everything from the
 * last fetched block
 * arg 2 is the last block to fetch to, inclusive
 *
 * e.g. $ npm run get-mobile-sdk-transactions last 29782200
 * e.g. $ npm run get-mobile-sdk-transactions 29782000 29782200

 */
const main = async () => {
  const fromBlock = process.argv[2]
    ? process.argv[2] === "last"
      ? undefined
      : parseInt(process.argv[2])
    : 0;
  const toBlock = process.argv[3] ? parseInt(process.argv[3]) : 0;

  if (fromBlock && fromBlock <= 0) {
    console.error("From block must be > 0");
    return;
  }

  if (toBlock <= 0) {
    console.error("To block must be > 0");
    return;
  }

  await getMobileSDKTransactions(toBlock, fromBlock);

  closeKnexConnection();
};

main();
