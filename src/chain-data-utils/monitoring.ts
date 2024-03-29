import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

import fetch from "node-fetch";
import Web3 from "web3";
import { AbiItem } from "web3-utils";

import RelayHubABI from "./abis/relayhub.json";
import { getBlockNumber } from "./polygon";
import { getKnex } from "../database";

const knex = getKnex();

const web3Mumbai = new Web3(
  `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_ID}`
);
const web3Mainnet = new Web3(
  `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_ID}`
);

export async function checkAndTriggerMobileSDKAlerts() {
  console.log("Checking mobile SDK alerts");

  let allSuccess = true;

  try {
    await triggerPaymasterAlerts();
  } catch (error) {
    sendSNSAlert(`Error triggering paymaster alerts`, `Error: ${error}`);
    allSuccess = false;
  }

  try {
    await triggerRNAPaidAlerts();
  } catch (error) {
    sendSNSAlert(`Error triggering gas alerts`, `Error: ${error}`);
    allSuccess = false;
  }

  try {
    await triggerRelayAlerts();
  } catch (error) {
    sendSNSAlert(`Error triggering relay alerts`, `Error: ${error}`);
    allSuccess = false;
  }

  console.log("Finished checking mobile SDK alerts");

  return allSuccess;
}

async function sendSNSAlert(subject: string, body: string) {
  console.log(`Sending SNS alert ${subject} ${body}`);

  const client = new SNSClient({ region: "us-west-1" });

  const topicArn =
    process.env.OVERRIDE_SNS_TOPIC ||
    "arn:aws:sns:us-west-1:430011485041:RLY-Mobile-SDK-Alerts";

  const command = new PublishCommand({
    Subject: `[RLY SDK Alert] ${subject}`,
    Message: body,
    TopicArn: topicArn,
  });

  try {
    const data = await client.send(command);
    console.log(`SNS sent to ${topicArn} ${JSON.stringify(data)}`);
  } catch (error) {
    console.log(`SNS send error to ${topicArn}: ${error}`);
  }
}

async function triggerRelayAlerts() {
  const mumbaiManagerBalance = parseInt(
    await web3Mumbai.eth.getBalance(
      "0x3889a1fA05862DEb184c800997Aa441Cd5648b42"
    )
  );
  if (mumbaiManagerBalance < 2 * 10 ** 18) {
    sendSNSAlert(
      `Mumbai relay manager balance too low`,
      `Got mumbai relay manager balance ${
        mumbaiManagerBalance / 10 ** 18
      }. Relay manager address: 0x3889a1fA05862DEb184c800997Aa441Cd5648b42`
    );
  }

  const mumbaiWorkerBalance = parseInt(
    await web3Mumbai.eth.getBalance(
      "0xb9950b71ec94cbb274aeb1be98e697678077a17f"
    )
  );
  if (mumbaiWorkerBalance < 0.3 * 10 ** 18) {
    sendSNSAlert(
      `Mumbai relay worker balance too low`,
      `Got mumbai relay worker balance ${
        mumbaiWorkerBalance / 10 ** 18
      }. Relay worker address: 0xb9950b71ec94cbb274aeb1be98e697678077a17f`
    );
  }

  try {
    const mumbaiFetch = await fetch(
      `https://gsn-relay-polygon-mumbai.rly.network/getaddr`,
      { timeout: 5000 }
    );
    const mumbaiStatus = await mumbaiFetch.json();
    if (!mumbaiStatus.ready) {
      sendSNSAlert(
        `Mumbai relay manager is not ready`,
        `Got mumbai relay status: ${JSON.stringify(
          mumbaiStatus
        )}. https://gsn-relay-polygon-mumbai.rly.network/getaddr`
      );
    }
  } catch (error) {
    sendSNSAlert(
      `Mumbai relay manager response error`,
      `https://gsn-relay-polygon-mumbai.rly.network/getaddr Error: ${error}`
    );
  }

  const mainnetManagerBalance = parseInt(
    await web3Mainnet.eth.getBalance(
      "0x97cdbea30f494eddf513eec27c9b3bd5aff8d9d9"
    )
  );
  if (mainnetManagerBalance < 2 * 10 ** 18) {
    sendSNSAlert(
      `Mainnet relay manager balance too low`,
      `Got mainnet relay manager balance ${
        mainnetManagerBalance / 10 ** 18
      }. Relay manager address: 0x97cdbea30f494eddf513eec27c9b3bd5aff8d9d9`
    );
  }

  const mainnetWorkerBalance = parseInt(
    await web3Mainnet.eth.getBalance(
      "0x579de7c56cd9a07330504a7c734023a9f703778a"
    )
  );
  if (mainnetWorkerBalance < 0.3 * 10 ** 18) {
    sendSNSAlert(
      `Mainnet relay worker balance too low`,
      `Got mainnet relay worker balance ${
        mainnetWorkerBalance / 10 ** 18
      }. Relay worker address: 0x579de7c56cd9a07330504a7c734023a9f703778a`
    );
  }

  try {
    const mainnetFetch = await fetch(
      `https://gsn-relay-polygon.rly.network/getaddr`,
      { timeout: 5000 }
    );
    const mainnetStatus = await mainnetFetch.json();
    if (!mainnetStatus.ready) {
      sendSNSAlert(
        `Mainnet relay manager is not ready`,
        `Got mainnet relay status: ${JSON.stringify(
          mainnetStatus
        )}. https://gsn-relay-polygon.rly.network/getaddr`
      );
    }
  } catch (error) {
    sendSNSAlert(
      `Mainnet relay manager response error`,
      `https://gsn-relay-polygon.rly.network/getaddr Error: ${error}`
    );
  }
}

async function triggerPaymasterAlerts() {
  const paymasterArgs = [
    {
      name: "Mumbai 3.0.0-beta.2",
      relayHub: "0x3232f21A6E08312654270c78A773f00dd61d60f5",
      paymaster: "0x298b3CA442474e2cf73874171986F90F0ACF07e2",
      web3: web3Mumbai,
    },
    {
      name: "Mumbai 3.0.0-beta.3",
      relayHub: "0x3232f21A6E08312654270c78A773f00dd61d60f5",
      paymaster: "0x499D418D4493BbE0D9A8AF3D2A0768191fE69B87",
      web3: web3Mumbai,
    },
    {
      name: "Mainnet 3.0.0-beta.2",
      relayHub: "0xfCEE9036EDc85cD5c12A9De6b267c4672Eb4bA1B",
      paymaster: "0x8053437610491a877a1078BA7b1deD7D353f14cf",
      web3: web3Mainnet,
    },
    {
      name: "Mainnet 3.0.0-beta.3",
      relayHub: "0xfCEE9036EDc85cD5c12A9De6b267c4672Eb4bA1B",
      paymaster: "0x61B9BdF9c10F77bD9eD033559Cec410427aeb8A2",
      web3: web3Mainnet,
    },
  ];

  const balances = await Promise.allSettled(
    paymasterArgs.map(async (args) =>
      getPaymasterBalance(
        args.web3,
        args.relayHub,
        args.paymaster,
        await args.web3.eth.getBlockNumber()
      )
    )
  );

  balances.forEach((result, index) => {
    if (result.status === "rejected") {
      sendSNSAlert(
        `Error fetching ${paymasterArgs[index]!.name} balance`,
        `Can double check manually - go to contract methods at relayHub address ${
          paymasterArgs[index]!.relayHub
        } and call balanceOf using paymaster address ${
          paymasterArgs[index]!.paymaster
        }`
      );
      return;
    }
    if (result.value < 5 * 10 ** 18) {
      sendSNSAlert(
        `${paymasterArgs[index]!.name} paymaster balance too low`,
        `Got ${paymasterArgs[index]!.name} paymaster balance ${
          result.value / 10 ** 18
        }. Check relayHub address ${
          paymasterArgs[index]!.relayHub
        } and call balanceOf using paymaster address ${
          paymasterArgs[index]!.paymaster
        }`
      );
    }
  });
}

async function getPaymasterBalance(
  web3Handler: Web3,
  relayHubAddress: string,
  paymasterAddress: string,
  blockNumber: number
) {
  const contract = new web3Handler.eth.Contract(
    RelayHubABI as AbiItem[],
    relayHubAddress
  );
  return contract.methods.balanceOf(paymasterAddress).call({}, blockNumber);
}

async function triggerRNAPaidAlerts() {
  const currentBlock = await getBlockNumber(); // pulls from currently set environment, so will match DB

  // about 1600 blocks per hour, doesnt need to be exact
  const lastHourTransactions = await getRNAPaidKeyTransactionsInBlockRange(
    currentBlock - 1600,
    currentBlock
  );
  const lastWeekTransactions = await getRNAPaidKeyTransactionsInBlockRange(
    currentBlock - 7 * 24 * 1600,
    currentBlock
  );
  const lastWeekHourlyAverage = lastWeekTransactions / 7 / 24;
  if (lastHourTransactions > 10 * lastWeekHourlyAverage) {
    sendSNSAlert(
      `RNA paid transactions in the last hour is more than 10x the weekly average`,
      `Transactions in the last hour ${lastHourTransactions} vs ` +
        `transactions in the last week ${lastWeekTransactions} (${lastWeekHourlyAverage} per hour)`
    );
  }
}

/** Gets the count of MobileSDKKeyTransaction where gas_paid_by_rna = true in the block range
 *
 * Note that this only works for either mumbai or mainnet since we're pulling from the DB and not calling
 * directly on chain. So if we want to monitor both chains then we have to have this running on 2 separate environments
 * (with process.env.MOBILE_SDK_MUMBAI set differently)
 */
async function getRNAPaidKeyTransactionsInBlockRange(
  startBlock: number,
  endBlock: number
) {
  const result = await knex
    .from("mobile_sdk_key_transactions")
    .count("id")
    .where("gas_paid_by_rna", true)
    .whereBetween("block_number", [startBlock, endBlock]);

  return result[0].count;
}
