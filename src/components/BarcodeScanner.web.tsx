import { BrowserMultiFormatReader } from '@zxing/browser';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, layout, radius, spacing, typography } from '../theme';
import { Button, TextField } from './ui';
import { createBarcodeHints, getCameraErrorMessage, getCameraSupportMessage, stopMediaStream } from './BarcodeScanner.webUtils';

/** Browser barcode scanner. Decoding happens locally; camera frames are never uploaded. */
export function BarcodeScanner({ onScanned, busy }: { onScanned: (code: string) => void; busy?: boolean }) {
  const focused = useIsFocused();
  const { height } = useWindowDimensions();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const resultLockRef = useRef(false);
  const [manual, setManual] = useState('');
  const [starting, setStarting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback((updateUi = true) => {
    generationRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;

    const video = videoRef.current;
    stopMediaStream(streamRef.current);
    if (streamRef.current !== video?.srcObject) stopMediaStream(video?.srcObject);
    streamRef.current = null;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    if (updateUi) {
      setStarting(false);
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (!focused) stopCamera();
  }, [focused, stopCamera]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden') stopCamera();
    };
    const stopOnBlur = () => stopCamera();
    window.addEventListener('blur', stopOnBlur);
    document.addEventListener('visibilitychange', stopWhenHidden);

    return () => {
      window.removeEventListener('blur', stopOnBlur);
      document.removeEventListener('visibilitychange', stopWhenHidden);
      stopCamera(false);
    };
  }, [stopCamera]);

  const fire = useCallback((code: string) => {
    if (resultLockRef.current || busy) return;
    resultLockRef.current = true;
    onScanned(code);
    window.setTimeout(() => { resultLockRef.current = false; }, 2500);
  }, [busy, onScanned]);

  const startCamera = async () => {
    if (starting || scanning) return;
    setError(null);
    const supportMessage = getCameraSupportMessage(
      window.isSecureContext,
      Boolean(navigator.mediaDevices?.getUserMedia),
    );
    if (supportMessage) {
      setError(supportMessage);
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    setStarting(true);
    const generation = ++generationRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      if (generationRef.current !== generation) {
        stopMediaStream(stream);
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      if (generationRef.current !== generation) {
        stopMediaStream(stream);
        return;
      }

      const reader = new BrowserMultiFormatReader(createBarcodeHints());
      const controls = await reader.decodeFromVideoElement(
        video,
        (result) => {
          if (generationRef.current !== generation || !result || busy || resultLockRef.current) return;
          stopCamera(false);
          setScanning(false);
          fire(result.getText());
        },
      );
      if (generationRef.current !== generation) {
        controls.stop();
        stopMediaStream(stream);
        return;
      }
      controlsRef.current = controls;
      setScanning(true);
    } catch (cameraError) {
      if (generationRef.current === generation) {
        setError(getCameraErrorMessage(cameraError));
        stopCamera();
      }
      return;
    }
    if (generationRef.current === generation) setStarting(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.cameraWrap, { height: Math.max(180, Math.min(360, height * 0.5)) }]}>
        <video ref={videoRef} style={styles.video} autoPlay muted playsInline />
        {!scanning && !starting ? (
          <Text style={[typography.small, styles.cameraPlaceholder]}>
            Camera preview appears here after you start scanning
          </Text>
        ) : null}
        <View style={styles.frame} pointerEvents="none" />
      </View>
      {error ? <Text accessibilityRole="alert" style={[typography.small, styles.error]}>{error}</Text> : null}
      <Text style={[typography.small, styles.status]}>
        {busy ? 'Looking up product…' : scanning ? 'Point the camera at a barcode' : 'Camera access starts only when you tap below'}
      </Text>
      <View style={styles.actions}>
        <Button
          title={starting ? 'Starting camera…' : scanning ? 'Stop camera' : 'Start camera'}
          variant="secondary"
          disabled={starting}
          onPress={scanning ? () => stopCamera() : startCamera}
        />
        <Text style={[typography.small, styles.privacy]}>
          Barcode decoding happens on this device. Video is not uploaded.
        </Text>
        <TextField
          label="Or type the barcode number"
          value={manual}
          onChangeText={setManual}
          keyboardType="number-pad"
          placeholder="e.g. 3017620422003"
        />
        <Button
          title="Look up"
          variant="secondary"
          disabled={manual.replace(/\D/g, '').length < 8 || busy}
          onPress={() => {
            stopCamera();
            fire(manual.replace(/\D/g, ''));
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.formMaxWidth, alignSelf: 'center', padding: spacing.lg },
  cameraWrap: { position: 'relative', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  video: { position: 'absolute', width: '100%', height: '100%', inset: 0, objectFit: 'cover' },
  cameraPlaceholder: { position: 'absolute', left: spacing.lg, right: spacing.lg, top: '42%', textAlign: 'center', color: '#fff' },
  frame: {
    position: 'absolute', top: '25%', left: '10%', right: '10%', bottom: '25%',
    borderWidth: 3, borderColor: '#FFFFFFCC', borderRadius: radius.md,
  },
  status: { textAlign: 'center', marginTop: spacing.md },
  error: { color: colors.danger, textAlign: 'center', marginTop: spacing.md },
  privacy: { textAlign: 'center', marginVertical: spacing.md },
  actions: { paddingTop: spacing.md },
});
