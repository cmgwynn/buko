import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { config } from '../config';
export type { PurchasesPackage };
let currentUser: string | null = null;
let configured = false;
let queue: Promise<void> = Promise.resolve();
async function sdk(userId: string) {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) throw new Error('Purchases need a development or store build, not Expo Go.');
  const apiKey = Platform.OS === 'ios' ? config.revenueCatIosKey : config.revenueCatAndroidKey;
  if (!apiKey) throw new Error('Store subscriptions are not configured yet. No purchase was initiated.');
  const { default: Purchases } = await import('react-native-purchases');
  const task = queue.then(async () => {
    if (!configured) { Purchases.configure({ apiKey, appUserID: userId }); configured = true; }
    else if (currentUser !== userId) await Purchases.logIn(userId);
    currentUser = userId;
  });
  queue = task.catch(() => {});
  await task;
  return Purchases;
}
export async function storePackages(userId: string): Promise<PurchasesPackage[]> {
  const offerings = await (await sdk(userId)).getOfferings();
  return offerings.current?.availablePackages.filter((item) => item.packageType === 'MONTHLY' || item.packageType === 'ANNUAL') ?? [];
}
export async function purchase(userId: string, item: PurchasesPackage): Promise<void> {
  await (await sdk(userId)).purchasePackage(item);
}
export async function restore(userId: string): Promise<void> {
  await (await sdk(userId)).restorePurchases();
}
export async function resetStoreIdentity(): Promise<void> {
  const task = queue.then(async () => {
    if (!configured || !currentUser) return;
    const { default: Purchases } = await import('react-native-purchases');
    await Purchases.logOut();
    currentUser = null;
  });
  queue = task.catch(() => {});
  await task;
}
