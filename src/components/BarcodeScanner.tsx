import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { Button, TextField } from './ui';

/** Camera barcode scanner with a manual-entry fallback. Calls `onScanned` once per scan. */
export function BarcodeScanner({ onScanned, busy }: { onScanned: (code: string) => void; busy?: boolean }) {
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

  if (!permission) return <View style={styles.fill} />;

  if (!permission.granted) {
    return (
      <View style={[styles.fill, { padding: spacing.xl, justifyContent: 'center' }]}>
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
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={styles.cameraWrap}>
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
    </View>
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
  cameraWrap: { height: 360, margin: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  frame: {
    position: 'absolute', top: '25%', left: '10%', right: '10%', bottom: '25%',
    borderWidth: 3, borderColor: '#FFFFFFCC', borderRadius: radius.md,
  },
});
