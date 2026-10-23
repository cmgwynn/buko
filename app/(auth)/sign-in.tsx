import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Body, Button, Card, Notice, Screen, TextField, Title } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, typography } from '../../src/theme';

export default function SignIn() {
  const { height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (e) setError(e.message);
    setBusy(false);
  }

  return (
    <Screen variant="form" edges={['top', 'bottom']}>
      <View style={{ marginTop: height < 500 ? spacing.sm : spacing.xxl * 2, marginBottom: spacing.xl, paddingHorizontal: spacing.sm }}>
        <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: -1.5, color: colors.primary }}>Buko</Text>
        <Body muted>Scan it. Plan it. Cook it. Log it.</Body>
      </View>
      <Card>
        <Title>Welcome back</Title>
        <View style={{ height: spacing.lg }} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
        <Button title="Log in" onPress={submit} loading={busy} disabled={!email || !password} />
      </Card>
      <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
        <Link href="/(auth)/sign-up" style={[typography.body, { color: colors.primary }]}>
          New here? Create an account
        </Link>
      </View>
    </Screen>
  );
}
