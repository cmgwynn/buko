import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Heading, TextField, Screen } from '../src/components/ui';
import { deleteAccount, reauthenticate } from '../src/lib/account/client';
import { useAuth } from '../src/providers/AuthProvider';
import { SubscriptionManagement } from '../src/components/SubscriptionManagement';
import { pendingWorkoutCount, syncPendingWorkouts } from '../src/lib/fitness/offline';

/** Public web entry for store account-deletion links; personal details are never shown. */
export default function DeleteAccountScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [pendingWorkouts, setPendingWorkouts] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    setPendingWorkouts(null);
    if (session) pendingWorkoutCount(session.user.id)
      .then((count) => { if (active) setPendingWorkouts(count); })
      .catch(() => { if (active) setMessage('Offline workout status could not be read. Retry syncing before deleting your account.'); });
    return () => { active = false; };
  }, [session?.user.id]);
  async function syncWorkouts() {
    if (!session) return;
    setBusy(true); setMessage('');
    try {
      const result = await syncPendingWorkouts(session.user.id);
      setPendingWorkouts(result.pending);
      setMessage(result.error
        ? `Workout sync did not finish. ${result.pending} queued changes remain safely on this device. ${result.error}`
        : `${result.pending} queued changes remaining. Synced workouts and preferences will be included in export and removed if you permanently delete your account.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Workout sync failed. Queued workouts were preserved.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (deleted && !session && !cleanupError) {
      router.replace({ pathname: '/(auth)/sign-in', params: { accountDeleted: 'true' } });
    }
  }, [deleted, session, cleanupError, router]);
  async function remove() {
    setBusy(true); setMessage('');
    try {
      if (password) await reauthenticate(password);
      setPassword('');
      const result = await deleteAccount(confirmation);
      setCleanupError(result.cleanupError);
      setDeleted(true);
      setConfirmation('');
      setMessage(result.cleanupError ?? 'Your Buko account was permanently deleted. Your subscription, if any, was not cancelled.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Deletion failed. Please retry.'); }
    finally { setBusy(false); }
  }
  return (
    <Screen>
      <View style={{ gap: 18 }}>
        {deleted ? <>
          <Heading>Your Buko account was deleted</Heading>
          {!!message && <Text accessibilityRole="alert">{message}</Text>}
          <SubscriptionManagement />
          {!session ? <Button title="Back to Buko" onPress={() => router.replace({ pathname: '/(auth)/sign-in', params: { accountDeleted: 'true' } })} /> : null}
        </> : <>
        <Heading>Delete your Buko account</Heading>
        <Body>You can request permanent account deletion here on the web or in the app at Profile → Settings, privacy &amp; account → Export data or delete account → Permanently delete account. No paid plan is required.</Body>
        <Card>
          <Body>1. Sign in to the Buko account you want to delete.</Body>
          <Body>2. Export and save your data if you want a copy. Saved private recipe photos are embedded in the JSON archive as base64 image bytes, not expiring download links.</Body>
          <Body>3. Review your subscription, confirm your password or sign in again, type DELETE, then choose permanent deletion below.</Body>
        </Card>
        <Link href="/account">Export my data first</Link>
        <Card>
          <Heading>What deletion removes</Heading>
          <Body>Your active Buko sign-in account, profile and birthday, targets, diary, groceries, pantry, meal plans, recipes and private photos, personal exercises, routines, workouts and sets, body measurements, imported activity, preferences, coach history/actions/snapshots/usage, and Buko’s purchase-status records are permanently removed. Cleared data cannot be restored through the app.</Body>
          <Body>Your shared recipes, ratings, reviews, reports and block preferences are also deleted. Other members&apos; independently saved private copies remain; the link to your deleted contribution is cleared.</Body>
          <Body>Deletion may finish in stages. If a photo, provider or account step fails, the error explains it and you can retry; some photos or external records may already be removed. The auth account is deleted only after photo removal succeeds.</Body>
        </Card>
        <Card>
          <Heading>Subscriptions &amp; retained copies</Heading>
          <SubscriptionManagement />
          <Body>Deletion does not issue a refund. Restoring purchases does not restore deleted Buko data.</Body>
          <Body>Apple Health and Health Connect originals and records already written there remain in the health app; manage them there. Downloads and copies you shared remain wherever you saved them.</Body>
          <Body>Infrastructure/security logs, backups and external provider records may remain under the relevant provider’s retention policy. This action does not promise immediate backup erasure or deletion of app-store/payment-provider transaction records. RevenueCat subscriber deletion is attempted only when the owner configured its server secret; this never cancels subscriptions. No unverified retention period is promised here.</Body>
        </Card>
        {!session && !deleted && <Card>
          <Body>Sign in first, then return to this page to finish deletion. Deletion requires access to the account so that another person cannot delete your data.</Body>
          <Link href="/(auth)/sign-in">Sign in to continue deletion</Link>
        </Card>}
        {session && !deleted && <Card>
          <Body>Finish or explicitly discard your active workout before deletion. Queued offline workouts and fitness preference changes must be synced before deletion. Export a local copy first if needed. Account deletion never silently discards active or queued workouts. {pendingWorkouts === null ? 'Checking this device’s offline queue.' : `${pendingWorkouts} changes queued on this device.`}</Body>
          <Button title="Sync queued workouts first" variant="secondary" loading={busy} onPress={syncWorkouts} />
          <Body>Confirm your identity with your current password if your last sign-in was more than 10 minutes ago. If you use a sign-in provider, sign out and sign back in with that provider first.</Body>
          <TextField label="Current password (if needed)" secureTextEntry value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="current-password" />
          <TextField label="Type DELETE to confirm permanent deletion" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} />
          <Button title="Permanently delete my account" variant="danger" loading={busy} disabled={confirmation !== 'DELETE'} onPress={remove} />
        </Card>}
        {!!message && <Text accessibilityRole="alert">{message}</Text>}
        </>}
      </View>
    </Screen>
  );
}
