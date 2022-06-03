/** This is similar to TrackedTokenAccountBalance except there is only a row if a balance changes on a given day
 * instead of a row for every token for every day
 *
 * The data in this table could be used to rebuild/debug TrackedTokenAccountBalance if needed (e.g. if something
 * went wrong while copying the previous day's data from one day to the next)
 */
export interface TrackedTokenAccountBalanceChange {
  id?: number;
  tracked_token_account_id: number;
  datetime: Date;
  approximate_minimum_balance: number;
}
