import { fetch } from "cross-fetch";
import { sign, decode, JwtPayload } from "jsonwebtoken";
import { queryGQL } from "./graphql";

let currentRnbCookie: string | undefined;
let currentRnbCookieExpiration: Date | undefined;

async function authenticate() {
  // return current cookie if > 5 minutes
  if (
    currentRnbCookieExpiration &&
    currentRnbCookieExpiration.valueOf() - new Date().valueOf() > 300000
  ) {
    return currentRnbCookie;
  }

  var appClientToken = sign(
    {
      jti: process.env.RNB_CLIENT_ID,
      $int_roles: ["act:appclient"],
    },
    process.env.RNB_CLIENT_SECRET!,
    { expiresIn: "2m", subject: process.env.RNB_CLIENT_ID }
  );

  const rnbCookie = await (
    await fetch("https://rnb-api.rallynetwork.io/user/v1/actLogin", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: appClientToken,
    })
  ).text();

  // these only last an hour before needing to be refreshed, so just store locally in memory
  const decoded = decode(rnbCookie) as JwtPayload;
  currentRnbCookie = rnbCookie;
  currentRnbCookieExpiration = new Date(decoded.exp! * 1000);

  return currentRnbCookie;
}

export async function queryRNB(queryString: string, variables?: object) {
  const rnbCookie = await authenticate();

  let headers = [
    ["Cookie", `Bearer=${rnbCookie}`],
    ["Content-Type", "application/json"],
  ];

  return await queryGQL(
    "https://rnb-api.rallynetwork.io/report/v1/graphql/json",
    queryString,
    variables,
    headers
  );
}

/** Finds the offset of UTC and PT from the current server timezone and uses that to return a date set to PT
 *  This should work on any server timezone
 *
 * @param year passed into new Date(), e.g. 2022
 * @param month passed into new Date(), i.e. from 0 to 11
 * @param day passed into new Date(), i.e. from 1 to 31
 */
export function midnightPTFromYearMonthDate(
  year: number,
  month: number,
  day: number
) {
  let utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));

  const utcMidnightWithServerOffset = new Date(
    // calling `new Date()` again the toLocaleString formatted string adds the offset for `UTC - server`
    utcMidnight.toLocaleString("en-US", { timeZone: "UTC" })
  );
  const utcMidnightWithPTOffset = new Date(
    // Adds the offset for `PT - server`. This takes into account DST even on a non-DST (e.g. UTC) time server
    utcMidnight.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    })
  );
  const currentUTCtoPTOffset =
    utcMidnightWithServerOffset.getTime() - utcMidnightWithPTOffset.getTime();

  return new Date(utcMidnight.getTime() + currentUTCtoPTOffset);
}

/** Gets the `aggregate` object for a date. Note this should only be used for vanity metrics due to timezone
 * differences of RNB (PDT or PST) vs rly-rewards (UTC). We just return the results for a day as
 * "yyyy-mm-ddT00:00:00.000Z" and ignore those 7-8 hours of difference
 *
 * @param year passed into new Date(), e.g. 2022
 * @param month passed into new Date(), i.e. from 0 to 11
 * @param day passed into new Date(), i.e. from 1 to 31
 */
export async function getAggregateForDate(
  year: number,
  month: number,
  day: number
) {
  const midnightPT =
    midnightPTFromYearMonthDate(year, month, day).getTime() / 1000;

  // get data from RNB
  const reportStatus: { reportStatus: { reportId: string } } =
    await queryRNB(`query getReportId {
      reportStatus(request:{reportId:"rms::Official::${midnightPT}"}) {
        reportId
      }  
    }`);

  console.log(`status ${JSON.stringify(reportStatus)}`);

  const aggregate = await queryRNB(`query getAggregate {
    aggregate(request: {mode: Official, id:"f9f9d82a-0e78-4bc6-b9d8-2a0e78bbc64e"}) {
      effectiveTime
      subreports {
        key
        subreportDetails {
          ... on E11WalletCountsSubreport {
            data {
              appId
              userCount
            }
          }
          ... on E12NonEmptyWalletCountsSubreport {
            data {
              appId
              nonEmptyWalletCount
            }
          }
          ... on E13BridgedInRcSubreport {
            data {
              appId
              bridgedInRcFromEthCount
            }
          }
          ... on E14ActiveWalletCountsSubreport {
            data {
              appId
              activeWalletCount
            }
          }
          ... on E21RcBalancesSubreport {
            data {
              appId
              rcBalance
            }
          }
          ... on E22SubcoinBackingSubreport {
            data {
              appId
              totalBacking
            }
          }
        }
      }
    }
  }`);

  console.log(`aggregate ${JSON.stringify(aggregate)}`);
}
