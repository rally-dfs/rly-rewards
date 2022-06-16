import Web3 from "web3";
import { AbiType } from "web3-utils";

const TIMEOUT_BETWEEN_CALLS = 1000;

const web3 = new Web3(
  `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_ID}`
);

const balanceOfABI = [
  // balanceOf
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: <AbiType>"function",
  },
];

export async function getERC20BalanceAtBlock(
  tokenAddress: string,
  address: string,
  blockNumber: number
) {
  const contract = new web3.eth.Contract(balanceOfABI, tokenAddress);
  return contract.methods.balanceOf(address).call({}, blockNumber);
}

export async function getERC20BalancesForAddressesAtBlocks(
  tokenAddress: string,
  addressToBlockMap: { [key: string]: number }
) {
  // alchemy supports ~10 eth_calls per second
  const chunkSize = 10;
  const balances: { [key: string]: string } = {};
  const entries = Object.entries(addressToBlockMap);

  for (let i = 0; i < entries.length; i += chunkSize) {
    const promises = entries.slice(i, i + chunkSize).map(([address, block]) =>
      getERC20BalanceAtBlock(tokenAddress, address, block).then((value) => {
        balances[address] = value;
      })
    );
    await Promise.allSettled(promises);

    // rate limiting here in case we make too many calls
    await new Promise((f) => setTimeout(f, TIMEOUT_BETWEEN_CALLS));
  }

  return balances;
}
