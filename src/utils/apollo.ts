import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  gql,
  NormalizedCacheObject,
} from "@apollo/client";

export function createApolloClient(uri: string, headers: object) {
  return new ApolloClient({
    ssrMode: typeof window === "undefined",
    link: new HttpLink({
      uri: uri,
      headers,
    }),
    cache: new InMemoryCache(), // TODO: need to put anything here?
  });

  // TODO: we can do a lot more stuff with caching probably (since it's on the backend though need to make sure
  // there's no private info leak from different calls), e.g.
  // https://github.com/vercel/next.js/blob/c947c9320619f1bd9a786bf7f3d1b36b79bde8b0/examples/with-apollo/lib/apolloClient.js#L30
  // https://medium.com/@zhamdi/server-side-rendering-ssr-using-apollo-and-next-js-ac0b2e3ea461
}

export async function queryApollo(
  client: ApolloClient<NormalizedCacheObject>,
  query: string,
  variables?: object
) {
  //   console.log("calling query = ", query, variables);

  try {
    const result = await client.query({
      query: gql(query),
      variables: variables,
      // TODO: fix this? bitquery doesn't have IDs on solana so paging doesn't work with cache.
      // maybe no need to use apollo at all
      fetchPolicy: "no-cache",
    });

    //   console.log("result = ", result);
    //   console.log("json", JSON.stringify(result, undefined, 2));

    return result;
  } catch (error) {
    console.log("queryApollo error", query, variables, error);
    return { data: [] };
  }
}
