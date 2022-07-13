import * as chai from "chai";
import chaiExclude from "chai-exclude";

import { stub, SinonStub, match } from "sinon";

import * as graphql from "../../src/chain-data-utils/graphql";
import * as chainConstants from "../../src/chain-data-utils/constants";
import {
  BQ_ETH_TRANSFERS_PAGE_ONE,
  BQ_ETH_TRANSFERS_PAGE_TWO,
} from "./stub_data";

import { getKnex } from "../../src/database";
import { getAllEthTokenAddressInfoAndTransactions } from "../../src/chain-data-utils/bq_tracked_token_eth";
import * as ethereum from "../../src/chain-data-utils/ethereum";
import { TrackedTokenAccountInfo } from "../../src/chain-data-utils/bq_tracked_token_base";

chai.use(chaiExclude);

const knex = getKnex();

describe("#getAllEthTokenAddressInfoAndTransactions", () => {
  let pageLimitStub: SinonStub;
  let timeoutStub: SinonStub;
  let bitqueryGraphqlStub: SinonStub;
  let erc20BalanceStub: SinonStub;

  beforeEach(async () => {
    pageLimitStub = stub(chainConstants, "BITQUERY_FETCH_ALL_PAGES_PAGE_LIMIT");
    pageLimitStub.returns(2);

    timeoutStub = stub(chainConstants, "BITQUERY_TIMEOUT_BETWEEN_CALLS");
    timeoutStub.returns(0);

    bitqueryGraphqlStub = stub(graphql, "queryGQL");
    bitqueryGraphqlStub
      .onCall(0)
      .returns(Promise.resolve(BQ_ETH_TRANSFERS_PAGE_ONE));
    bitqueryGraphqlStub
      .onCall(1)
      .returns(Promise.resolve(BQ_ETH_TRANSFERS_PAGE_TWO));
    bitqueryGraphqlStub.returns(Promise.resolve(undefined));

    erc20BalanceStub = stub(ethereum, "getERC20BalancesForAddressesAtBlocks");
    erc20BalanceStub.returns(
      Promise.resolve({
        addressAAAAA: "111111111111111111111", // 111.111_111...
        addressBBBBB: "222222222222222222222",
        addressCCCCC: "333333333333333333333",
      })
    );
  });

  afterEach(async () => {
    pageLimitStub.restore();
    timeoutStub.restore();
    bitqueryGraphqlStub.restore();
    erc20BalanceStub.restore();
  });

  const _assertTokenInfoAfterStubbedTransactions = (
    tokenInfo: TrackedTokenAccountInfo[]
  ) => {
    // after all three txns:
    // addressAAAAA has 111.111_111... and received txn2 and txn3 and sent txn1
    // addressBBBBB has 222.222_222... and received txn1 and sent txn3
    // addressCCCCC has 333.333_333... and sent txn2
    chai.expect(tokenInfo).to.eql([
      {
        tokenAccountAddress: "addressAAAAA",
        approximateMinimumBalance: "111111111111111111111",
        incomingTransactions: {
          signature22222: {
            hash: "signature22222",
            transaction_datetime: new Date("2022-06-01T00:02:00.000Z"),
            amount: "2222222222222000000",
          },
          signature33333: {
            hash: "signature33333",
            transaction_datetime: new Date("2022-06-01T00:03:00.000Z"),
            amount: "3333333333333000000",
          },
        },
        outgoingTransactions: {
          signature11111: {
            hash: "signature11111",
            transaction_datetime: new Date("2022-06-01T00:01:00.000Z"),
            amount: "1111111111111000000",
          },
        },
      },
      {
        tokenAccountAddress: "addressBBBBB",
        approximateMinimumBalance: "222222222222222222222",
        incomingTransactions: {
          signature11111: {
            hash: "signature11111",
            transaction_datetime: new Date("2022-06-01T00:01:00.000Z"),
            amount: "1111111111111000000",
          },
        },
        outgoingTransactions: {
          signature33333: {
            hash: "signature33333",
            transaction_datetime: new Date("2022-06-01T00:03:00.000Z"),
            amount: "3333333333333000000",
          },
        },
      },
      {
        tokenAccountAddress: "addressCCCCC",
        approximateMinimumBalance: "333333333333333333333",
        incomingTransactions: {},
        outgoingTransactions: {
          signature22222: {
            hash: "signature22222",
            transaction_datetime: new Date("2022-06-01T00:02:00.000Z"),
            amount: "2222222222222000000",
          },
        },
      },
    ]);
  };

  it("Fetches full info from bitquery and on chain data", async () => {
    const tokenInfo = await getAllEthTokenAddressInfoAndTransactions(
      "tokenmint00000",
      18,
      new Date("2022-06-01T00:00:00Z"),
      new Date("2022-06-02T00:00:00Z")
    );

    _assertTokenInfoAfterStubbedTransactions(tokenInfo);
  });
});
