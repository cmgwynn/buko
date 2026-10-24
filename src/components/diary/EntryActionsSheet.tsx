import { useEffect, useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FoodLogEntry } from '../../types';
import { diaryRpc, loadFoodFavorites } from '../../lib/diaryActionsClient';
import { recentKey } from '../../lib/foodLogging';
import { Button, Notice } from '../ui';
import { colors, spacing, typography } from '../../theme';
import { useAuth } from '../../providers/AuthProvider';

export function EntryActionsSheet({ entry, onClose, onTransfer }: {
  entry: FoodLogEntry | null; onClose(): void; onTransfer(mode: 'move' | 'copy', entry: FoodLogEntry): void;
}) {
  const { session } = useAuth();
  const [favorite, setFavorite] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    setError(null); setReady(false);
    if (entry) loadFoodFavorites().then((rows) => {
      if (active) { setFavorite(rows.some((row) => row.food_key === recentKey(entry))); setReady(true); }
    }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [entry]);
  async function toggleFavorite() {
    if (!entry || !session || !ready || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await diaryRpc('diary_favorite', { p_entry: entry.id, p_enabled: !favorite, p_expected_user_id: session.user.id });
      setFavorite(!favorite);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update this favorite.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal visible={entry !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' }}>
      <View style={{ padding: spacing.xl, backgroundColor: colors.surface }}>
        <Text accessibilityRole="header" style={typography.heading}>{entry?.name}</Text>
        <Text style={[typography.small, { marginVertical: spacing.md }]}>Keep the same portion and nutrition when moving or copying.</Text>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button title={favorite ? 'Remove food from favorites' : 'Favorite this food'} loading={busy} disabled={!ready} onPress={() => { void toggleFavorite(); }} />
        <Button title="Move to another meal or day" variant="secondary" disabled={busy} onPress={() => { if (entry) onTransfer('move', entry); }} />
        <Button title="Copy to another meal or day" variant="secondary" disabled={busy} onPress={() => { if (entry) onTransfer('copy', entry); }} />
        <Button title="Done" variant="ghost" disabled={busy} onPress={onClose} />
      </View>
    </SafeAreaView>
  </Modal>;
}
