import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, layout, radius, spacing, typography } from '../theme';
import { Button, TextField } from './ui';

/** Camera barcode scanner with a manual-entry fallback. Calls `onScanned` once per scan. */
export function BarcodeScanner({ onScanned, busy }: { onScanned: (code: string) => void; busy?: boolean }) {
  const { height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const lock = useRef(false);
  const [manual, setManual] = useState('');

  const fire = (code: string) => {
    if (lock.current || busy) return;
    lock.current = true;
    onScanned(code);
    // Allow scanning again shortly after, e.g. when the user comes back to this screen.
    setTimeout(() => { lock.current = false; }, 2500);
  };

  if (Platform.OS === 'web') {
    return (
      <ScrollView contentContainerStyle={styles.manualContent} keyboardShouldPersistTaps="handled">
        <Text style={[typography.small, { textAlign: 'center' }]}>
          Camera scanning is available in the mobile app. Enter a barcode below to look up a product.
        </Text>
        <ManualEntry value={manual} onChange={setManual} onSubmit={fire} />
      </ScrollView>
    );
  }

  if (!permission) return <View style={styles.fill} />;

  if (!permission.granted) {
    return (
      <ScrollView contentContainerStyle={[styles.manualContent, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
        <Ionicons name="camera-outline" size={44} color={colors.primary} style={{ alignSelf: 'center' }} />
        <Text style={[typography.body, { textAlign: 'center', marginVertical: spacing.lg }]}>
          Buko needs the camera to read product barcodes. Images are never saved or uploaded.
        </Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={requestPermission} />
        ) : (
          <Button title="Open settings" onPress={() => Linking.openSettings()} />
        )}
        <ManualEntry value={manual} onChange={setManual} onSubmit={fire} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ width: '100%', maxWidth: layout.formMaxWidth, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <View style={[styles.cameraWrap, { height: Math.min(360, height * 0.5) }]}>
        {focused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={({ data }) => fire(data)}
          />
        ) : null}
        <View style={styles.frame} pointerEvents="none" />
      </View>
      <Text style={[typography.small, { textAlign: 'center', marginTop: spacing.md }]}>
        {busy ? 'Looking up product…' : 'Point the camera at a barcode'}
      </Text>
      <View style={{ padding: spacing.lg }}>
        <ManualEntry value={manual} onChange={setManual} onSubmit={fire} />
      </View>
    </ScrollView>
  );
}

function ManualEntry({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: (code: string) => void }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <TextField label="Or type the barcode number" value={value} onChangeText={onChange} keyboardType="number-pad" placeholder="e.g. 3017620422003" />
      <Button title="Look up" variant="secondary" disabled={value.replace(/\D/g, '').length < 8} onPress={() => onSubmit(value.replace(/\D/g, ''))} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  manualContent: { width: '100%', maxWidth: layout.formMaxWidth, alignSelf: 'center', padding: spacing.lg },
  cameraWrap: { margin: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  frame: {
    position: 'absolute', top: '25%', left: '10%', right: '10%', bottom: '25%',
    borderWidth: 3, borderColor: '#FFFFFFCC', borderRadius: radius.md,
  },
});
