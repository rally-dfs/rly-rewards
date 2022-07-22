import * as chai from "chai";
import chaiExclude from "chai-exclude";

import { stub, SinonStub, match } from "sinon";

import * as graphql from "../../src/chain-data-utils/graphql";
import * as chainConstants from "../../src/chain-data-utils/constants";
import {
  SOLANA_GET_TRANSACTION_ONE,
  SOLANA_GET_TRANSACTION_TWO,
  SOLANA_GET_TRANSACTION_THREE,
} from "./stub_data";

import * as ethereum from "../../src/chain-data-utils/ethereum";

import { getKnex } from "../../src/database";
import { getDailyTokenBalancesBetweenDates } from "../../src/chain-data-utils/bq_liquidity_pool_base";
import { TEST_MOCK_ONLY_CONNECTION } from "../../src/chain-data-utils/solana";

chai.use(chaiExclude);

const knex = getKnex();

describe("#getDailyTokenBalancesBetweenDates", () => {
  let timeoutStub: SinonStub;
  let bitqueryGraphqlStub: SinonStub;

  const _stubSolanaResponseForSignatureAndDate = (
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

  const _stubEthResponseForSignatureAndDate = (
    signature: string,
    date: string,
    block: number
  ) => {
    // same as bitquery response format
    return {
      ethereum: {
        transfers: [
          {
            transaction: {
              signature: signature,
            },
            block: {
              height: block,
              timestamp: {
                iso8601: date,
              },
            },
          },
        ],
      },
    };
  };

  /** This stubs out both solana and ethereum with the same params (not ever needed for the same test, but seemed
   * cleaner to keep this all in one method rather than having 2 similar looking ones)
   */
  const _stubWithDateAndSignatures = (
    endDate: string,
    senderSignature: string,
    senderDate: string,
    senderBlock: number,
    receiverSignature: string,
    receiverDate: string,
    receiverBlock: number
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
          _stubSolanaResponseForSignatureAndDate(senderSignature, senderDate)
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
          _stubSolanaResponseForSignatureAndDate(
            receiverSignature,
            receiverDate
          )
        )
      );

    bitqueryGraphqlStub
      .withArgs(
        match.any,
        match(
          (gqlString: string) =>
            gqlString.indexOf("sender: {is: $tokenAccountAddress}") !== -1
        ),
        match((gqlVariables: Object) => gqlVariables["endTime"] === endDate)
      )
      .returns(
        Promise.resolve(
          _stubEthResponseForSignatureAndDate(
            senderSignature,
            senderDate,
            senderBlock
          )
        )
      );

    bitqueryGraphqlStub
      .withArgs(
        match.any,
        match(
          (gqlString: string) =>
            gqlString.indexOf("receiver: {is: $tokenAccountAddress}") !== -1
        ),
        match((gqlVariables: Object) => gqlVariables["endTime"] === endDate)
      )
      .returns(
        Promise.resolve(
          _stubEthResponseForSignatureAndDate(
            receiverSignature,
            receiverDate,
            receiverBlock
          )
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
      202205310001, // make sure block number ordering matches timestamps
      "signature22222",
      "2022-05-31T00:02:00Z",
      202205310002
    );

    // for second 6/2 call, return sender (signature11111) after receiver (signature33333)
    // (it's okay if these are reused/don't match the txn dates, the solana on chain call is mocked below anyway)
    _stubWithDateAndSignatures(
      "2022-06-01T23:59:59.999Z",
      "signature11111",
      "2022-06-01T00:10:00Z",
      202206010010, // make sure block number ordering matches timestamps
      "signature33333",
      "2022-06-01T00:05:00Z",
      202206010005
    );

    // for third 6/3 call, return sender (signature33333) after receiver (signature22222)
    _stubWithDateAndSignatures(
      "2022-06-02T23:59:59.999Z",
      "signature33333",
      "2022-06-02T10:00:00Z",
      202206021000, // make sure block number ordering matches timestamps
      "signature22222",
      "2022-06-02T05:00:00Z",
      202206020500
    );
  });

  afterEach(async () => {
    timeoutStub.restore();
    bitqueryGraphqlStub.restore();
  });

  describe("solana", () => {
    let solanaGetTransactionStub: SinonStub;

    beforeEach(async () => {
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
      solanaGetTransactionStub.restore();
    });

    it("Returns balance for most recent transaction", async () => {
      const balances = await getDailyTokenBalancesBetweenDates(
        "", // tokenAccountAddress not used for solana
        "ownerAAAAA", // make sure to use ownerAAAAA, since that's the only address in all 3 txns
        "tokenmint00000",
        "solana",
        new Date("2022-06-01T00:00:00Z"), // make sure we use endDateExclusive here
        new Date("2022-06-03T00:00:00Z")
      );
      chai.expect(balances).to.eql([
        // 6/1 should have signature22222 (the later txn)'s balance
        {
          dateExclusive: new Date("2022-06-01T00:00:00Z"),
          balance: "12222222222",
        },
        // 6/2 should have signature11111 (the later txn)'s balance
        {
          dateExclusive: new Date("2022-06-02T00:00:00Z"),
          balance: "10000000000",
        },
        // 6/3 should have signature33333 (the later txn)'s balance
        {
          dateExclusive: new Date("2022-06-03T00:00:00Z"),
          balance: "15555555555",
        },
      ]);
    });
  });

  describe("ethereum", () => {
    let erc20BalanceStub: SinonStub;

    beforeEach(async () => {
      erc20BalanceStub = stub(ethereum, "getERC20BalanceAtBlock");
      // just return the block number as the balance every time for simplicity
      erc20BalanceStub.callsFake((_tokenAddress, _address, blockNumber) =>
        Promise.resolve(blockNumber + "0".repeat(18))
      );
    });

    afterEach(async () => {
      erc20BalanceStub.restore();
    });

    it("Returns balance for most recent transaction", async () => {
      const balances = await getDailyTokenBalancesBetweenDates(
        "accountAAAAA",
        "", // owner address not needed for eth
        "tokenmint00000",
        "ethereum",
        new Date("2022-06-01T00:00:00Z"), // make sure we use endDateExclusive here
        new Date("2022-06-03T00:00:00Z")
      );
      chai.expect(balances).to.eql([
        // 6/1 should have signature22222 (the later txn)'s balance
        {
          dateExclusive: new Date("2022-06-01T00:00:00Z"),
          balance: "202205310002" + "0".repeat(18),
        },
        // 6/2 should have signature11111 (the later txn)'s balance
        {
          dateExclusive: new Date("2022-06-02T00:00:00Z"),
          balance: "202206010010" + "0".repeat(18),
        },
        // 6/3 should have signature33333 (the later txn)'s balance
        {
          dateExclusive: new Date("2022-06-03T00:00:00Z"),
          balance: "202206021000" + "0".repeat(18),
        },
      ]);
    });
  });
});
