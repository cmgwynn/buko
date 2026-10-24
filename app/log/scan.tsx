import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarcodeScanner } from '../../src/components/BarcodeScanner';
import { Button, Notice } from '../../src/components/ui';
import { getProductByBarcode } from '../../src/lib/api/openFoodFacts';
import { spacing } from '../../src/theme';

/** Scan a barcode from the food diary, then go straight to the portion screen. */
export default function LogScan() {
  const router = useRouter();
  const { meal, date } = useLocalSearchParams<{ meal?: string; date?: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      {message ? <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Notice tone="danger">{message}</Notice>
        <Button title="Try scanning again" variant="secondary" onPress={() => { setMessage(null); setAttempt((n) => n + 1); }} />
        <Button title="Search by name" variant="secondary" onPress={() => router.replace({ pathname: '/log/search', params: { meal, date } })} />
        <Button title="Enter nutrition manually" variant="ghost" onPress={() => router.replace({ pathname: '/log/manual', params: { meal, date } })} />
      </View> : <BarcodeScanner key={attempt} onScanned={onScanned} busy={busy} />}
    </SafeAreaView>
  );
}
