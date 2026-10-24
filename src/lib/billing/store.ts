import type { PurchasesPackage } from 'react-native-purchases';
export type { PurchasesPackage };
export async function storePackages(_userId: string): Promise<PurchasesPackage[]> {
  return [];
}
export async function purchase(_userId: string, _item: PurchasesPackage): Promise<void> {
  throw new Error('Purchasing is available only in a supported Buko iOS or Android build.');
}
export async function restore(_userId: string): Promise<void> {
  throw new Error('Restore purchases in the Buko app on the store where you subscribed, then refresh access here.');
}
export async function resetStoreIdentity(): Promise<void> {}
