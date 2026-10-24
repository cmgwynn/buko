import { Button, Notice } from './ui';
import { View } from 'react-native';
import type { RecoveryState } from '../lib/localRecovery';

export function RecoveryNotice({ state, kind, retry }: { state: RecoveryState; kind: 'Recipe draft' | 'Workout'; retry(): Promise<void> }) {
  if (state.error) return (
    <View>
      <Notice tone="danger">{state.error}</Notice>
      <Button title="Retry device save" variant="secondary" onPress={() => { void retry().catch(() => {}); }} />
    </View>
  );
  if (!state.ready) return <Notice tone="info">Checking this account’s saved {kind.toLowerCase()}…</Notice>;
  if (state.status === 'expired') return <Notice>The previous {kind.toLowerCase()} expired and was removed from this device.</Notice>;
  if (state.status === 'recovered') return <Notice tone="info">Recovered {kind.toLowerCase()} from this device{state.savedAt ? ` (${new Date(state.savedAt).toLocaleString()})` : ''}. Review it before continuing.</Notice>;
  if (state.status === 'saving') return <Notice tone="info">Saving {kind.toLowerCase()} on this device…</Notice>;
  if (state.status === 'saved') return <Notice tone="info">{kind} saved on this device{state.savedAt ? ` at ${new Date(state.savedAt).toLocaleTimeString()}` : ''}. {kind === 'Recipe draft' ? 'Expires after 7 days without changes.' : 'Workouts expire 24 hours after starting.'}</Notice>;
  return null;
}
