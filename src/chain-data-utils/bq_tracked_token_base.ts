export type TrackedTokenAccountInfoTransaction = {
  hash: string;
  transaction_datetime: Date;
  amount: string; // needs to be string since eth values can overflow `number`
};

export type TrackedTokenAccountInfo = {
  tokenAccountAddress: string;
  ownerAccountAddress?: string;
  approximateMinimumBalance?: string;
  incomingTransactions: { [key: string]: TrackedTokenAccountInfoTransaction };
  outgoingTransactions: { [key: string]: TrackedTokenAccountInfoTransaction };
};
