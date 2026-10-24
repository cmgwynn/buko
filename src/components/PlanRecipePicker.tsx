import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { communityRpc, type CommunityDetail, type CommunityRow } from '../lib/recipes/community';
import { communityCopy } from '../lib/recipes/communityPolicy';
import { filterLibraryRecipes, starterRecipeDraft } from '../lib/recipes/library';
import type { Recipe, RecipeDraft } from '../lib/recipes/types';
import { colors, layout, radius, spacing, typography } from '../theme';
import { Body, Button, Card, Chip, ChipRow, Loading, Notice, TextField } from './ui';

export type PlanChoice = { title: string; id: string; draft?: never } | { title: string; draft: RecipeDraft; id?: never };

export function PlanRecipePicker({ visible, recipes, mealLabel, onClose, onAdd }: {
  visible: boolean; recipes: Recipe[]; mealLabel: string;
  onClose(): void; onAdd(choice: PlanChoice, servings: number): Promise<boolean>;
}) {
  const [source, setSource] = useState<'saved' | 'library' | 'shared'>('saved');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const [shared, setShared] = useState<CommunityRow[]>([]);
  const [sharedTotal, setSharedTotal] = useState(0);
  const [choice, setChoice] = useState<PlanChoice | null>(null);
  const [servings, setServings] = useState('1');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  useEffect(() => {
    if (visible) { setChoice(null); setServings('1'); setError(null); }
    else version.current++;
  }, [visible]);
  useEffect(() => { setLimit(12); }, [source, query]);
  useEffect(() => {
    const request = ++version.current;
    if (!visible || source !== 'shared') { setLoading(false); return; }
    setLoading(true); setError(null);
    const timer = setTimeout(() => {
      communityRpc<{ rows: CommunityRow[]; total: number }>('community_browse', { p_query: query.trim().slice(0, 120), p_offset: 0 })
        .then((result) => { if (version.current === request) { setShared(result.rows); setSharedTotal(result.total); } })
        .catch((e: unknown) => { if (version.current === request) { setShared([]); setSharedTotal(0); setError(e instanceof Error ? e.message : 'Could not load shared recipes.'); } })
        .finally(() => { if (version.current === request) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); if (version.current === request) version.current++; };
  }, [source, query, visible]);
  const saved = recipes.filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()));
  const library = useMemo(() => filterLibraryRecipes({ search: query }), [query]);
  async function chooseShared(row: CommunityRow) {
    const request = ++version.current;
    setBusy(true); setError(null);
    try {
      const detail = await communityRpc<CommunityDetail>('community_detail', { p_id: row.id });
      if (request === version.current) setChoice({ title: row.title, draft: communityCopy(detail.recipe.payload, row.id) });
    } catch (e) { if (request === version.current) setError(e instanceof Error ? e.message : 'Could not open recipe.'); }
    finally { if (request === version.current) setBusy(false); }
  }
  async function add() {
    const amount = Number(servings);
    if (!choice || busy || !Number.isFinite(amount) || amount < 0.5 || amount > 100) return;
    setBusy(true);
    try { if (await onAdd(choice, amount)) onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not add recipe. Please retry.'); }
    finally { setBusy(false); }
  }
  const rows = source === 'saved'
    ? saved.slice(0, limit).map((r) => ({ key: r.id, title: r.title, description: 'Saved recipe', choose: () => setChoice({ id: r.id, title: r.title }) }))
    : source === 'library'
      ? library.slice(0, limit).map((r) => ({ key: r.id, title: r.title, description: `${r.cuisine} · ${r.prepMinutes + r.cookMinutes} min · ${r.description}`, choose: () => setChoice({ draft: starterRecipeDraft(r), title: r.title }) }))
      : shared.map((r) => ({ key: r.id, title: r.title, description: `${r.cuisine} · ${r.nutrition_score === null ? 'Nutrition incomplete' : `Nutrition ${r.nutrition_score}`} · ${r.average_rating === null ? 'No reviews' : `${Number(r.average_rating).toFixed(1)} stars`}`, choose: () => { void chooseShared(r); } }));
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} accessibilityViewIsModal style={{ width: '100%', maxWidth: layout.formMaxWidth, alignSelf: 'center', maxHeight: '92%', backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }}>
        <Text accessibilityRole="header" style={typography.heading}>{choice ? 'Confirm your meal' : `Add to ${mealLabel}`}</Text>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {choice ? <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={[typography.subheading, { marginVertical: spacing.lg }]}>{choice.title}</Text>
          {choice.draft ? <>
            <Notice tone="info">This saves a private, editable copy and adds it to your selected day and meal. Nothing is shared.</Notice>
            <Body muted>{choice.draft.ingredients.map((i) => i.name).join(' · ')}</Body>
          </> : null}
          <TextField label="Servings to plan" value={servings} onChangeText={setServings} keyboardType="decimal-pad" />
          <Button title="Add to meal plan" onPress={() => { void add(); }} loading={busy} disabled={!Number.isFinite(Number(servings)) || Number(servings) < 0.5 || Number(servings) > 100} />
          <Button title="Choose another recipe" variant="ghost" disabled={busy} onPress={() => setChoice(null)} />
        </ScrollView> : <>
          <ChipRow>{([['saved', 'My recipes'], ['library', 'Buko library'], ['shared', 'Shared']] as const).map(([key, label]) => <Chip key={key} label={label} selected={source === key} disabled={busy} onPress={() => { setSource(key); setError(null); }} />)}</ChipRow>
          <TextField accessibilityLabel="Search recipes to plan" placeholder="Search recipes" editable={!busy} value={query} onChangeText={setQuery} />
          <ScrollView keyboardShouldPersistTaps="handled">
            {loading || busy ? <Loading /> : rows.map((row) => <Pressable key={row.key} accessibilityRole="button" onPress={row.choose}><Card style={{ padding: spacing.md }}><Text style={typography.subheading}>{row.title}</Text><Text style={typography.small}>{row.description}</Text></Card></Pressable>)}
            {!loading && !busy && !rows.length && !error ? <>
              <Body muted>{source === 'saved' ? 'No saved recipes match. Find your first meal in the Buko library.' : 'No matching recipes.'}</Body>
              {source === 'saved' ? <Button title="Browse Buko recipes" onPress={() => { setSource('library'); setQuery(''); }} /> : null}
            </> : null}
            {source !== 'shared' && (source === 'saved' ? saved.length : library.length) > limit ? <Button title="Show more recipes" variant="secondary" onPress={() => setLimit((n) => n + 12)} /> : null}
            {source === 'shared' && shared.length < sharedTotal ? <Button title="Load more shared recipes" variant="secondary" disabled={loading} onPress={async () => {
              const request = ++version.current;
              setLoading(true);
              try {
                const more = await communityRpc<{ rows: CommunityRow[]; total: number }>('community_browse', { p_query: query.trim().slice(0, 120), p_offset: shared.length });
                if (version.current === request) { setShared((old) => [...old, ...more.rows]); setSharedTotal(more.total); }
              } catch (e) { if (version.current === request) setError(e instanceof Error ? e.message : 'Could not load more recipes.'); }
              finally { if (version.current === request) setLoading(false); }
            }} /> : null}
          </ScrollView>
        </>}
        <Button title="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
      </SafeAreaView>
    </View>
  </Modal>;
}
