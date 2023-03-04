export interface MobileSDKWallet {
  id?: number;
  client_app_id?: number; // nullable since can be filled in after creation
  address: string;
}
