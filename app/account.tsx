import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Heading, TextField, Screen } from '../src/components/ui';
import { exportAccount, reauthenticate } from '../src/lib/account/client';
import { saveAccountExport } from '../src/lib/account/download';
import { useAuth } from '../src/providers/AuthProvider';

export default function AccountScreen() {
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function download() {
    setBusy(true); setMessage('');
    try {
      if (password) await reauthenticate(password);
      setPassword('');
      setMessage(await saveAccountExport(await exportAccount()));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Export failed. Please retry.'); }
    finally { setBusy(false); }
  }
  return (
    <Screen>
      <View style={{ gap: 18 }}>
        <Heading>Account &amp; your data</Heading>
        <Body>Export your data before deleting your account. Exports contain sensitive nutrition, birthday, health, coach and purchase information. Store them securely.</Body>
        {!session ? <Link href="/(auth)/sign-in">Sign in to manage your data</Link> : (
          <Card>
            <Body>The JSON export includes all saved account data, recipe ingredients and steps, workouts and sets, health imports, settings, coach history, usage and purchase status, plus this device’s unsaved recipe and workout.</Body>
            <Body>Saved private recipe photos are embedded in the JSON as durable base64 image bytes with their content type and path—not expiring links. The complete JSON is limited to 20 MiB, with a 5 MiB limit per photo, 1,000 photos and 25,000 rows plus photo objects. Larger exports fail explicitly with no partial archive; contact the app operator for a complete assisted export.</Body>
            <Body>For security, sign-in must be within the last 10 minutes. Confirm your password below if needed. A refreshed session alone does not count.</Body>
            <TextField label="Current password (if needed)" secureTextEntry value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="current-password" />
            <Button title="Export all my data" loading={busy} onPress={download} />
          </Card>
        )}
        {!!message && <Text accessibilityRole="alert">{message}</Text>}
        <Link href="/premium">Manage subscription</Link>
        <Link href="/delete-account">Permanently delete account</Link>
      </View>
    </Screen>
  );
}
