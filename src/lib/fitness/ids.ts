import * as Crypto from 'expo-crypto';

export const stableUUID = (): string => Crypto.randomUUID();
