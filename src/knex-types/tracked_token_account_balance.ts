export interface TrackedTokenAccountBalance {
  id?: number;
  tracked_token_account_id: number;
  datetime: Date;
  // we don't have good/efficient enough data to get a real balance here, so this is just a best guess to answer
  // "does this account have > 0 balance". solana.fm doens't have decimal precision and bitquery only has a balance
  // change and not a real balance (i.e. it's probably too efficient to try and piece it together or call on chain
  // data for every TrackedTokenAccount to get a real balance, though we can certainly try in the future if we need more
  // precision)
  // note since bitquery only has balance change, we only store the positive changes here and ignore negative ones
  // (if we start trying to piece together whether a negative change caused the account to go to 0, might as well just
  // try to get the real balance)
  approximate_minimum_balance: number;
}
