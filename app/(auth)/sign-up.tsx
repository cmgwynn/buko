import { Link } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Body, Button, Card, Notice, Screen, TextField, Title } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, typography } from '../../src/theme';

export default function SignUp() {
  const { height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit() {
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.auth.signUp({ email: email.trim(), password });
    if (e) setError(e.message);
    // With email confirmation enabled in Supabase there is no session until the link is tapped.
    else if (!data.session) setCheckEmail(true);
    setBusy(false);
  }

  return (
    <Screen variant="form" edges={['top', 'bottom']}>
      <View style={{ marginTop: height < 500 ? spacing.sm : spacing.xxl * 2 }} />
      <Card>
        <Title>Create your account</Title>
        <View style={{ height: spacing.sm }} />
        <Body muted>Your data stays private to you. No ads, no tracking.</Body>
        <View style={{ height: spacing.lg }} />
        {checkEmail ? (
          <Notice tone="info">We sent a confirmation link to {email.trim()}. Open it, then come back and log in.</Notice>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <TextField label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} />
        <Button title="Sign up" onPress={submit} loading={busy} disabled={!email || !password} />
      </Card>
      <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
        <Link href="/(auth)/sign-in" style={[typography.body, { color: colors.primary }]}>
          Already have an account? Log in
        </Link>
      </View>
    </Screen>
  );
}
