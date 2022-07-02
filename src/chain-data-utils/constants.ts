// keeping these in a separate module so we can mock them out for testing, basically just consts

export function BITQUERY_TIMEOUT_BETWEEN_CALLS() {
  return 10000;
}

export function BITQUERY_FETCH_ALL_PAGES_PAGE_LIMIT() {
  return 2500;
}
