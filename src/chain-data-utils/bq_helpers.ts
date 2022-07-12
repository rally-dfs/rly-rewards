import {
  BITQUERY_FETCH_ALL_PAGES_PAGE_LIMIT,
  BITQUERY_TIMEOUT_BETWEEN_CALLS,
} from "./constants";
import { queryGQL } from "./graphql";

export async function queryBitqueryGQL(
  queryString: string,
  variables?: object
) {
  let headers: [string, string][] = [
    ["X-API-KEY", process.env.BITQUERY_API_KEY!],
    ["Content-Type", "application/json"],
  ];
  return await queryGQL(
    "https://graphql.bitquery.io/",
    queryString,
    variables,
    headers
  );
}

/** Helper to handle getting all pages of results (with rate limiting built in)
 *
 * @param queryString graphql query as a string. Must include `limit` and `offset` as inputs
 * @param variables variables (`limit` and `offset` will be added to this)
 * @param dataPath function used to extract desired results array from the raw json object
 * @returns list of parametrized objects, e.g. BitquerySolanaTransfer or BitqueryEthereumTransfer
 */
export async function fetchAllPagesWithQueryAndVariables<T>(
  queryString: string,
  variables: any,
  dataPath: (data: any) => Array<T>
) {
  const pageLimit = BITQUERY_FETCH_ALL_PAGES_PAGE_LIMIT();
  const maxOffset = pageLimit * 1000000; // infinite loop protection

  let allTransfers: Array<T> = [];

  let offset = 0;
  let hasMorePages = true;

  while (hasMorePages && offset < maxOffset) {
    console.log("fetching offset", offset);

    variables["limit"] = pageLimit;
    variables["offset"] = offset;

    const data = await queryBitqueryGQL(queryString, variables);

    const transfers: Array<T> = dataPath(data);

    allTransfers = allTransfers.concat(transfers);

    hasMorePages = transfers.length == pageLimit;
    offset += pageLimit;

    // rate limiting here in case we make too many calls
    await new Promise((f) => setTimeout(f, BITQUERY_TIMEOUT_BETWEEN_CALLS()));
  }

  return allTransfers;
}
