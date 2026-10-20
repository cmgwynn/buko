import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarcodeScanner } from '../../src/components/BarcodeScanner';
import { Heading } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';

export default function ScanTab() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}><Heading>Scan a product</Heading></View>
      <BarcodeScanner onScanned={(code) => router.push({ pathname: '/product/[barcode]', params: { barcode: code } })} />
    </SafeAreaView>
  );
}
