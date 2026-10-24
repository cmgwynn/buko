import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { Button, Chip, ChipRow, Notice } from '../ui';
import { useConfirm } from '../ConfirmProvider';
import { MEALS, addDays, toDateString } from '../../lib/diary';
import { transferDiary, mirrorDiaryTransfer, previewDayCopy } from '../../lib/diaryActionsClient';
import type { DiaryTransferInput } from '../../lib/diaryActions';
import { useAuth } from '../../providers/AuthProvider';
import type { FoodLogEntry, Meal } from '../../types';
import { colors, layout, spacing, typography } from '../../theme';
import { CalendarSheet } from '../date/CalendarSheet';

export type TransferSelection = { entry: FoodLogEntry; mode: 'move' | 'copy' } | { sourceDate: string; mode: 'day' };
export function DiaryTransferSheet({ selection, onClose, onSaved }: {
  selection: TransferSelection | null; onClose(): void; onSaved(message: string): void;
}) {
  const { session } = useAuth();
  const confirm = useConfirm();
  const [date, setDate] = useState(toDateString(new Date()));
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [calendar, setCalendar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const running = useRef(false);
  useEffect(() => {
    if (!selection) return;
    const today = toDateString(new Date());
    setDate(selection.mode === 'day' ? (selection.sourceDate === today ? addDays(today, -1) : today) : selection.entry.logged_on);
    setMeal(selection.mode === 'day' ? 'breakfast' : selection.entry.meal);
    setError(null); setCommitted(null); request.current = null;
  }, [selection]);
  async function save() {
    if (!selection || !session || running.current || committed) return;
    if (date > toDateString(new Date())) { setError('Logged food can only be moved or copied to today or an earlier date. Use Plan for future meals.'); return; }
    const input: DiaryTransferInput = selection.mode === 'day'
      ? { mode: 'day', sourceDate: selection.sourceDate, targetDate: date }
      : { mode: selection.mode, entryId: selection.entry.id, targetDate: date, targetMeal: meal };
    const signature = JSON.stringify(input);
    const message = selection.mode === 'day'
      ? `Copy logged food from ${selection.sourceDate} to ${date}, keeping each meal and portion. Existing entries stay; matching food portions already there are skipped.`
      : `${selection.mode === 'move' ? 'Move' : 'Copy'} ${selection.entry.name} (${Math.round(selection.entry.grams)} g, ${Math.round(selection.entry.calories)} kcal) to ${meal} on ${date}. ${selection.mode === 'move' ? 'It will leave its original meal.' : 'The original entry stays. This deliberately adds another portion.'}`;
    running.current = true; setBusy(true); setError(null);
    let persisted: string | null = null;
    try {
      const preview = selection.mode === 'day' ? await previewDayCopy(session.user.id, selection.sourceDate, date) : message;
      if (!await confirm({ title: selection.mode === 'move' ? 'Move logged food?' : 'Copy logged food?', message: preview, confirmLabel: selection.mode === 'move' ? 'Move food' : 'Copy food' })) return;
      if (request.current?.signature !== signature) request.current = { signature, id: randomUUID() };
      const result = await transferDiary(session.user.id, request.current.id, input);
      const summary = `${result.changed} entr${result.changed === 1 ? 'y' : 'ies'} ${selection.mode === 'move' ? 'moved' : 'copied'} to ${date}.${result.skipped ? ` ${result.skipped} matching portion${result.skipped === 1 ? '' : 's'} skipped.` : ''}`;
      persisted = summary;
      setCommitted(summary);
      const warning = await mirrorDiaryTransfer(result);
      if (warning) { setError(warning); onSaved(`${summary} ${warning}`); }
      else { onSaved(summary); onClose(); }
    } catch (e) {
      const problem = e instanceof Error ? e.message : 'Please check your connection.';
      setError(persisted ? `${persisted} Health synchronization could not finish: ${problem}` : `Could not change your diary: ${problem}`);
      if (persisted) onSaved(persisted);
    }
    finally { running.current = false; setBusy(false); }
  }
  return <Modal visible={selection !== null} animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, width: '100%', maxWidth: layout.formMaxWidth, alignSelf: 'center' }}>
        <Text accessibilityRole="header" style={typography.heading}>{selection?.mode === 'day' ? 'Copy a whole day' : selection?.mode === 'move' ? 'Move food' : 'Copy food'}</Text>
        <Text style={[typography.body, { marginVertical: spacing.lg }]}>{selection?.mode === 'day' ? `Source day: ${selection.sourceDate}` : selection?.entry.name}</Text>
        <Button title={`Destination date: ${date}`} variant="secondary" disabled={busy || !!committed} onPress={() => setCalendar(true)} />
        {selection?.mode !== 'day' ? <ChipRow>{MEALS.map((m) => <Chip key={m.key} label={m.label} selected={meal === m.key} disabled={busy || !!committed} onPress={() => setMeal(m.key)} />)}</ChipRow> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {committed ? <Notice tone="info">{committed} Your Buko changes are saved. Do not repeat the action to retry health synchronization.</Notice> : null}
        {!committed ? <Button title={selection?.mode === 'move' ? 'Review move' : 'Review copy'} loading={busy} onPress={() => { void save(); }} /> : null}
        <Button title={committed ? 'Done' : 'Cancel'} variant="ghost" disabled={busy} onPress={onClose} />
      </ScrollView>
    </SafeAreaView>
    <CalendarSheet visible={calendar} selectedDate={date} maxDate={toDateString(new Date())} onSelect={(value) => { setDate(value); setCalendar(false); setError(null); }} onClose={() => setCalendar(false)} />
  </Modal>;
}
