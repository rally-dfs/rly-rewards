import * as chai from "chai";
import chaiExclude from "chai-exclude";

import { stub, SinonStub } from "sinon";

import * as graphql from "../../src/chain-data-utils/graphql";
import * as chainConstants from "../../src/chain-data-utils/constants";
import {
  BQ_SOL_TRANSFERS_PAGE_ONE,
  BQ_SOL_TRANSFERS_PAGE_TWO,
  SOLANA_GET_TRANSACTION_ONE,
  SOLANA_GET_TRANSACTION_TWO,
  SOLANA_GET_TRANSACTION_THREE,
} from "./stub_data";

import { getKnex } from "../../src/database";
import { getAllSolanaTrackedTokenAccountInfoAndTransactions } from "../../src/chain-data-utils/bq_tracked_token_sol";
import * as solanaConnection from "../../src/chain-data-utils/solana_connection";
import { TrackedTokenAccountInfo } from "../../src/chain-data-utils/bq_tracked_token_base";

chai.use(chaiExclude);

const knex = getKnex();

describe("#getAllSolanaTrackedTokenAccountInfoAndTransactions", () => {
  let pageLimitStub: SinonStub;
  let timeoutStub: SinonStub;
  let bitqueryGraphqlStub: SinonStub;
  let solanaGetTransactionStub: SinonStub;

  // stub out getAllSolanaTrackedTokenAccountInfoAndTransactions
  beforeEach(async () => {
    pageLimitStub = stub(chainConstants, "BITQUERY_FETCH_ALL_PAGES_PAGE_LIMIT");
    pageLimitStub.returns(2);

    timeoutStub = stub(chainConstants, "BITQUERY_TIMEOUT_BETWEEN_CALLS");
    timeoutStub.returns(0);

    bitqueryGraphqlStub = stub(graphql, "queryGQL");
    bitqueryGraphqlStub
      .onCall(0)
      .returns(Promise.resolve(BQ_SOL_TRANSFERS_PAGE_ONE));
    bitqueryGraphqlStub
      .onCall(1)
      .returns(Promise.resolve(BQ_SOL_TRANSFERS_PAGE_TWO));
    bitqueryGraphqlStub.returns(Promise.resolve(undefined));

    solanaGetTransactionStub = stub(
      solanaConnection,
      "getTransactionsTriaged"
    ).callsFake((signatures) =>
      Promise.resolve(
        // signatures can be passed into getTransaction in any order so make sure to return responses in the same order
        signatures.map(
          (signature) =>
            ({
              signature11111: SOLANA_GET_TRANSACTION_ONE,
              signature22222: SOLANA_GET_TRANSACTION_TWO,
              signature33333: SOLANA_GET_TRANSACTION_THREE,
            }[signature])
        )
      )
    );
  });

  afterEach(async () => {
    pageLimitStub.restore();
    timeoutStub.restore();
    bitqueryGraphqlStub.restore();
    solanaGetTransactionStub.restore();
  });

  const _assertTokenInfoAfterStubbedTransactions = (
    tokenInfo: TrackedTokenAccountInfo[]
  ) => {
    // after all three txns:
    // ownerAAAAA has 15555555555 and received txn2 and txn3 and sent txn1
    // ownerBBBBB has 18777777778 and received txn1 and sent txn3
    // ownerCCCCC has 30000000000 and sent txn2
    chai.expect(tokenInfo).to.eql([
      {
        tokenAccountAddress: "tokenaccountAAAAA",
        ownerAccountAddress: "ownerAAAAA",
        approximateMinimumBalance: "15555555555",
        incomingTransactions: {
          signature22222: {
            hash: "signature22222",
            transaction_datetime: new Date("2022-06-01T00:02:00.000Z"),
            amount: "2222222222",
          },
          signature33333: {
            hash: "signature33333",
            transaction_datetime: new Date("2022-06-01T00:03:00.000Z"),
            amount: "3333333333",
          },
        },
        outgoingTransactions: {
          signature11111: {
            hash: "signature11111",
            transaction_datetime: new Date("2022-06-01T00:01:00.000Z"),
            amount: "1111111111",
          },
        },
      },
      {
        tokenAccountAddress: "tokenaccountBBBBB",
        ownerAccountAddress: "ownerBBBBB",
        approximateMinimumBalance: "18777777778",
        incomingTransactions: {
          signature11111: {
            hash: "signature11111",
            transaction_datetime: new Date("2022-06-01T00:01:00.000Z"),
            amount: "1111111111",
          },
        },
        outgoingTransactions: {
          signature33333: {
            hash: "signature33333",
            transaction_datetime: new Date("2022-06-01T00:03:00.000Z"),
            amount: "3333333333",
          },
        },
      },
      {
        tokenAccountAddress: "tokenaccountCCCCC",
        ownerAccountAddress: "ownerCCCCC",
        approximateMinimumBalance: "30000000000",
        incomingTransactions: {},
        outgoingTransactions: {
          signature22222: {
            hash: "signature22222",
            transaction_datetime: new Date("2022-06-01T00:02:00.000Z"),
            amount: "2222222222",
          },
        },
      },
    ]);
  };

  it("Fetches full info from bitquery and on chain data", async () => {
    const tokenInfo = await getAllSolanaTrackedTokenAccountInfoAndTransactions(
      "tokenmint00000",
      9,
      new Date("2022-06-01T00:00:00Z"),
      new Date("2022-06-02T00:00:00Z")
    );

    _assertTokenInfoAfterStubbedTransactions(tokenInfo);
  });

  it("Handles missing solana on chain fetch", async () => {
    // make sure stub returns an error for txn 3 (even after retries)
    solanaGetTransactionStub
      .withArgs("signature33333")
      .returns(Promise.resolve(null));

    const tokenInfo = await getAllSolanaTrackedTokenAccountInfoAndTransactions(
      "tokenmint00000",
      9,
      new Date("2022-06-01T00:00:00Z"),
      new Date("2022-06-02T00:00:00Z")
    );

    // should still get the same token info, inferred from bitquery balance changes and the other 2 txns (since
    // accountA and accountB are both found in txn1 and txn2)
    _assertTokenInfoAfterStubbedTransactions(tokenInfo);
  });

  it("Handles retrying solana on chain fetch", async () => {
    // make sure stub returns an error for txn 2 the first time and returns it correctly on retry (there's not enough
    // info to get accountC's balance without it)
    solanaGetTransactionStub
      .withArgs("signature22222")
      .onCall(0)
      .returns(Promise.resolve(null));
    solanaGetTransactionStub
      .withArgs("signature22222")
      .onCall(1)
      .returns(Promise.resolve(SOLANA_GET_TRANSACTION_TWO));

    const tokenInfo = await getAllSolanaTrackedTokenAccountInfoAndTransactions(
      "tokenmint00000",
      9,
      new Date("2022-06-01T00:00:00Z"),
      new Date("2022-06-02T00:00:00Z")
    );

    // should still get the same token info if retry fetch succeeded
    _assertTokenInfoAfterStubbedTransactions(tokenInfo);
  });
});
