import { request, gql } from "graphql-request";

export async function queryGQL(
  url: string,
  queryString: string,
  variables?: object,
  headers?: HeadersInit
) {
  //   console.log("calling query = ", query, variables);

  try {
    const query = gql`
      ${queryString}
    `;
    const result = await request({
      url,
      document: query,
      variables,
      requestHeaders: headers,
    });

    //   console.log("result = ", result);
    //   console.log("json", JSON.stringify(result, undefined, 2));

    return result;
  } catch (error) {
    console.log("gql query error", queryString, variables, error);
    return { data: [] };
  }
}
