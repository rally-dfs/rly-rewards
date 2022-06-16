import { expect } from "chai";
import { midnightPTFromYearMonthDate } from "../../src/chain-data-utils/rnb";

// seems kind of annoying to mock different server time scenarios for this tests but i manually ran it with
// `TZ=UTC NODE_ENV=test ts-mocha` on a few different time zones and it passes fine
describe("#midnightPTFromYearMonthDate", () => {
  it("Returns correct time on 2022 DST boundaries", async () => {
    // DST is from 3/13 to 11/6 in 2022
    console.log(`current time ${new Date()}`);

    expect(midnightPTFromYearMonthDate(2022, 2, 12).getTime()).to.equal(
      1647072000000
    );

    // 3/13 midnight isn't DST yet (switchover is at 2AM PT) so this should still be 24 hours ahead
    expect(midnightPTFromYearMonthDate(2022, 2, 13).getTime()).to.equal(
      1647158400000
    );

    expect(midnightPTFromYearMonthDate(2022, 2, 14).getTime()).to.equal(
      1647241200000 // note this is only 23 hours ahead of 3/13 due to DST
    );

    expect(midnightPTFromYearMonthDate(2022, 2, 15).getTime()).to.equal(
      1647327600000
    );

    expect(midnightPTFromYearMonthDate(2022, 10, 5).getTime()).to.equal(
      1667631600000
    );

    // 11/6 isn't DST end yet (switchover is at 2AM PT) so this should still be only 24 hours ahead
    expect(midnightPTFromYearMonthDate(2022, 10, 6).getTime()).to.equal(
      1667718000000
    );

    expect(midnightPTFromYearMonthDate(2022, 10, 7).getTime()).to.equal(
      1667808000000 // note this is 25 hours ahead of 11/6 due to DST ending
    );

    expect(midnightPTFromYearMonthDate(2022, 10, 8).getTime()).to.equal(
      1667894400000
    );

    // also test some random dates in between
    expect(midnightPTFromYearMonthDate(2022, 0, 1).getTime()).to.equal(
      1641024000000
    );

    expect(midnightPTFromYearMonthDate(2022, 5, 9).getTime()).to.equal(
      1654758000000
    );

    expect(midnightPTFromYearMonthDate(2022, 11, 31).getTime()).to.equal(
      1672473600000
    );
  });

  it("Returns correct time on 2023 DST boundaries", async () => {
    // DST is from 3/12 to 11/5 in 2023
    console.log(`current time ${new Date()}`);

    expect(midnightPTFromYearMonthDate(2023, 2, 11).getTime()).to.equal(
      1678521600000
    );

    // 3/12 midnight isn't DST yet (switchover is at 2AM PT) so this should still be 24 hours ahead
    expect(midnightPTFromYearMonthDate(2023, 2, 12).getTime()).to.equal(
      1678608000000
    );

    expect(midnightPTFromYearMonthDate(2023, 2, 13).getTime()).to.equal(
      1678690800000 // note this is only 23 hours ahead of 3/13 due to DST
    );

    expect(midnightPTFromYearMonthDate(2023, 2, 14).getTime()).to.equal(
      1678777200000
    );

    expect(midnightPTFromYearMonthDate(2023, 10, 4).getTime()).to.equal(
      1699081200000
    );

    // 11/5 isn't DST end yet (switchover is at 2AM PT) so this should still be only 24 hours ahead
    expect(midnightPTFromYearMonthDate(2023, 10, 5).getTime()).to.equal(
      1699167600000
    );

    expect(midnightPTFromYearMonthDate(2023, 10, 6).getTime()).to.equal(
      1699257600000 // note this is 25 hours ahead of 11/6 due to DST ending
    );

    expect(midnightPTFromYearMonthDate(2023, 10, 7).getTime()).to.equal(
      1699344000000
    );

    // also test some random dates in between
    expect(midnightPTFromYearMonthDate(2023, 0, 1).getTime()).to.equal(
      1672560000000
    );

    expect(midnightPTFromYearMonthDate(2023, 5, 9).getTime()).to.equal(
      1686294000000
    );

    expect(midnightPTFromYearMonthDate(2023, 11, 31).getTime()).to.equal(
      1704009600000
    );
  });
});
