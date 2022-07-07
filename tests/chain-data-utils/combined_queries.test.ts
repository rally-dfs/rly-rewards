import * as chai from "chai";
import chaiExclude from "chai-exclude";

import { stub, SinonStub, match } from "sinon";

import * as graphql from "../../src/chain-data-utils/graphql";
import * as chainConstants from "../../src/chain-data-utils/constants";
import {
  SOLANA_TRANSFERS_PAGE_ONE,
  SOLANA_TRANSFERS_PAGE_TWO,
  SOLANA_GET_TRANSACTION_ONE,
  SOLANA_GET_TRANSACTION_TWO,
  SOLANA_GET_TRANSACTION_THREE,
} from "./combined_queries_stub_data";
import {
  TEST_MOCK_ONLY_CONNECTION,
  TrackedTokenAccountInfo,
} from "../../src/chain-data-utils/combined_queries";

import { getKnex } from "../../src/database";
import {
  getDailyTokenBalancesBetweenDates,
  getAllSolanaTrackedTokenAccountInfoAndTransactions,
} from "../../src/chain-data-utils/combined_queries";
import { gql } from "graphql-request";

chai.use(chaiExclude);

const knex = getKnex();

describe("#getDailyTokenBalancesBetweenDates", () => {
  let timeoutStub: SinonStub;
  let bitqueryGraphqlStub: SinonStub;
  let solanaGetTransactionStub: SinonStub;

  const _stubResponseForSignatureAndDate = (
    signature: string,
    date: string
  ) => {
    // same as bitquery response format
    return {
      solana: {
        transfers: [
          {
            transaction: {
              signature: signature,
            },
            block: {
              timestamp: {
                iso8601: date,
              },
            },
          },
        ],
      },
    };
  };

  const _stubWithDateAndSignatures = (
    endDate: string,
    senderSignature: string,
    senderDate: string,
    receiverSignature: string,
    receiverDate: string
  ) => {
    bitqueryGraphqlStub
      .withArgs(
        match.any,
        match(
          (gqlString: string) =>
            gqlString.indexOf(
              "senderAddress: {is: $tokenAccountOwnerAddress}"
            ) !== -1
        ),
        match((gqlVariables: Object) => gqlVariables["endTime"] === endDate)
      )
      .returns(
        Promise.resolve(
          _stubResponseForSignatureAndDate(senderSignature, senderDate)
        )
      );

    bitqueryGraphqlStub
      .withArgs(
        match.any,
        match(
          (gqlString: string) =>
            gqlString.indexOf(
              "receiverAddress: {is: $tokenAccountOwnerAddress}"
            ) !== -1
        ),
        match((gqlVariables: Object) => gqlVariables["endTime"] === endDate)
      )
      .returns(
        Promise.resolve(
          _stubResponseForSignatureAndDate(receiverSignature, receiverDate)
        )
      );
  };

  beforeEach(async () => {
    timeoutStub = stub(chainConstants, "BITQUERY_TIMEOUT_BETWEEN_CALLS");
    timeoutStub.returns(0);

    bitqueryGraphqlStub = stub(graphql, "queryGQL");

    // for first call, return sender (signature11111) before receiver (signature22222)
    _stubWithDateAndSignatures(
      // endDate gets changed to inclusive before being passed to gql (i.e. 2022-05-31T23:59:59.999Z) so be sure to
      // match on that instead of 06-01
      "2022-05-31T23:59:59.999Z",
      "signature11111",
      "2022-05-31T00:01:00Z",
      "signature22222",
      "2022-05-31T00:02:00Z"
    );

    // for second 6/2 call, return sender (signature11111) after receiver (signature33333)
    // (it's okay if these are reused/don't match the txn dates, the solana on chain call is mocked below anyway)
    _stubWithDateAndSignatures(
      "2022-06-01T23:59:59.999Z",
      "signature11111",
      "2022-06-01T00:10:00Z",
      "signature33333",
      "2022-06-01T00:05:00Z"
    );

    // for third 6/3 call, return sender (signature33333) after receiver (signature22222)
    _stubWithDateAndSignatures(
      "2022-06-02T23:59:59.999Z",
      "signature33333",
      "2022-06-02T10:00:00Z",
      "signature22222",
      "2022-06-02T05:00:00Z"
    );

    solanaGetTransactionStub = stub(
      TEST_MOCK_ONLY_CONNECTION,
      "getTransaction"
    );
    solanaGetTransactionStub
      .withArgs("signature11111")
      .returns(Promise.resolve(SOLANA_GET_TRANSACTION_ONE));
    solanaGetTransactionStub
      .withArgs("signature22222")
      .returns(Promise.resolve(SOLANA_GET_TRANSACTION_TWO));
    solanaGetTransactionStub
      .withArgs("signature33333")
      .returns(Promise.resolve(SOLANA_GET_TRANSACTION_THREE));
    solanaGetTransactionStub.returns(Promise.resolve(null));
  });

  afterEach(async () => {
    timeoutStub.restore();
    bitqueryGraphqlStub.restore();
    solanaGetTransactionStub.restore();
  });

  it("Returns balance for most recent transaction", async () => {
    const balances = await getDailyTokenBalancesBetweenDates(
      "ownerAAAAA", // make sure to use ownerAAAAA, since that's the only address in all 3 txns
      "tokenmint00000",
      new Date("2022-06-01T00:00:00Z"), // make sure we use endDateExclusive here
      new Date("2022-06-03T00:00:00Z")
    );
    chai.expect(balances).to.eql([
      // 6/1 should have signature22222 (the later txn)'s balance
      {
        dateExclusive: new Date("2022-06-01T00:00:00Z"),
        balance: 12222222222,
      },
      // 6/2 should have signature11111 (the later txn)'s balance
      {
        dateExclusive: new Date("2022-06-02T00:00:00Z"),
        balance: 10000000000,
      },
      // 6/3 should have signature33333 (the later txn)'s balance
      {
        dateExclusive: new Date("2022-06-03T00:00:00Z"),
        balance: 15555555555,
      },
    ]);
  });
});

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
      .returns(Promise.resolve(SOLANA_TRANSFERS_PAGE_ONE));
    bitqueryGraphqlStub
      .onCall(1)
      .returns(Promise.resolve(SOLANA_TRANSFERS_PAGE_TWO));
    bitqueryGraphqlStub.returns(Promise.resolve(undefined));

    solanaGetTransactionStub = stub(
      TEST_MOCK_ONLY_CONNECTION,
      "getTransaction"
    );
    solanaGetTransactionStub
      .withArgs("signature11111")
      .returns(Promise.resolve(SOLANA_GET_TRANSACTION_ONE));
    solanaGetTransactionStub
      .withArgs("signature22222")
      .returns(Promise.resolve(SOLANA_GET_TRANSACTION_TWO));
    solanaGetTransactionStub
      .withArgs("signature33333")
      .returns(Promise.resolve(SOLANA_GET_TRANSACTION_THREE));
    solanaGetTransactionStub.returns(Promise.resolve(null));
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
