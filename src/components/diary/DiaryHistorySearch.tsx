import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { diaryRpc } from '../../lib/diaryActionsClient';
import { foodFromEntry } from '../../lib/foodLogging';
import { MEALS } from '../../lib/diary';
import { useSelectedDate } from '../../providers/SelectedDateProvider';
import type { FoodLogEntry } from '../../types';
import { spacing, typography } from '../../theme';
import { Button, Card, Loading, Notice, TextField } from '../ui';

export function DiaryHistorySearch({ autoFocus = false }: { autoFocus?: boolean } = {}) {
  const router = useRouter();
  const { selectedDate, setSelectedDate, today } = useSelectedDate();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [rows, setRows] = useState<FoodLogEntry[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, []);
  async function search(offset = 0) {
    const text = offset ? submitted ?? '' : query.trim();
    if (text.length < 2 || text.length > 100) { setError('Enter between 2 and 100 characters.'); return; }
    const request = ++version.current;
    setLoading(true); setError(null);
    if (!offset) { setSubmitted(text); setRows([]); setMore(false); }
    try {
      const result = await diaryRpc<{ rows: FoodLogEntry[] }>('diary_history_search', { p_query: text, p_offset: offset });
      if (version.current !== request) return;
      setRows((old) => offset ? [...old, ...result.rows.slice(0, 20)] : result.rows.slice(0, 20));
      setMore(result.rows.length > 20);
    } catch (e) { if (version.current === request) setError(e instanceof Error ? e.message : 'Could not search your food history.'); }
    finally { if (version.current === request) setLoading(false); }
  }
  return <View>
    <TextField label="Search your food history" autoFocus={autoFocus} placeholder="When did I last eat salmon?" value={query} maxLength={100}
      onChangeText={(text) => { version.current++; setLoading(false); setQuery(text); setSubmitted(null); setRows([]); setMore(false); setError(null); }}
      onSubmitEditing={() => { void search(); }} returnKeyType="search" />
    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: -spacing.sm }}>
      <View style={{ flex: 1 }}><Button title="Search history" variant="secondary" loading={loading} disabled={query.trim().length < 2} onPress={() => { void search(); }} /></View>
      {submitted || query ? <Button title="Clear" variant="ghost" onPress={() => { version.current++; setQuery(''); setSubmitted(null); setRows([]); setMore(false); setError(null); setLoading(false); }} /> : null}
    </View>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {loading && !rows.length ? <Loading /> : null}
    {submitted && !loading && !error && !rows.length ? <Text style={typography.small}>No past entries match "{submitted}".</Text> : null}
    {rows.map((entry) => {
      const rebuilt = foodFromEntry(entry);
      return <Card key={entry.id} style={{ padding: spacing.md }}>
        <Text style={typography.subheading}>{entry.name}</Text>
        <Text style={typography.small}>{entry.logged_on} · {MEALS.find((meal) => meal.key === entry.meal)?.label} · {Math.round(entry.grams)} g · {Math.round(entry.calories)} kcal</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><Button title={`View ${entry.logged_on}`} variant="secondary" onPress={() => { setSelectedDate(entry.logged_on); router.navigate('/(tabs)'); }} /></View>
          {rebuilt ? <View style={{ flex: 1 }}><Button title={`Log ${entry.name} again`} variant="ghost" disabled={selectedDate > today} onPress={() => router.push({ pathname: '/log/add', params: {
            food: JSON.stringify(rebuilt.food), amount: String(rebuilt.last.quantity), unit: rebuilt.last.unit, date: selectedDate, meal: entry.meal,
          } })} /></View> : null}
        </View>
      </Card>;
    })}
    {more ? <Button title="More history" variant="secondary" disabled={loading} onPress={() => { void search(rows.length); }} /> : null}
    {submitted ? <Text style={typography.small}>Most recent logged dates first. Searches only your own saved entries.</Text> : null}
  </View>;
}
