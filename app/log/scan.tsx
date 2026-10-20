import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BarcodeScanner } from '../../src/components/BarcodeScanner';
import { Notice } from '../../src/components/ui';
import { getProductByBarcode } from '../../src/lib/api/openFoodFacts';
import { spacing } from '../../src/theme';

/** Scan a barcode from the food diary, then go straight to the portion screen. */
export default function LogScan() {
  const router = useRouter();
  const { meal, date } = useLocalSearchParams<{ meal?: string; date?: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onScanned(code: string) {
    setBusy(true);
    setMessage(null);
    try {
      const product = await getProductByBarcode(code);
      if (!product) setMessage(`Product ${code} isn't in Open Food Facts yet. Try searching instead.`);
      else router.replace({ pathname: '/log/add', params: { food: JSON.stringify(product), meal, date } });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong.');
    }
    setBusy(false);
  }

  return (
    <View style={{ flex: 1 }}>
      {message ? <View style={{ padding: spacing.lg, paddingBottom: 0 }}><Notice tone="danger">{message}</Notice></View> : null}
      <BarcodeScanner onScanned={onScanned} busy={busy} />
    </View>
  );
}
