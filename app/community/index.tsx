import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Body, Button, Card, Chip, ChipRow, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { RecipeSourceNav } from '../../src/components/RecipeSourceNav';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { communityRpc, loadContributorAliases, memberLabel, type CommunityRow } from '../../src/lib/recipes/community';
import { contributorLabel } from '../../src/lib/recipes/communityProfiles';
import { PublicAliasCard } from '../../src/components/PublicAliasCard';
import { COMMUNITY_CUISINES, COMMUNITY_MEALS, DIET_TAGS, type DietTag } from '../../src/lib/recipes/communityPolicy';
import { ratingFor } from '../../src/lib/scoring';
import { colors, radius, spacing, typography } from '../../src/theme';

export default function CommunityLibrary() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [meal, setMeal] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [tags, setTags] = useState<DietTag[]>([]);
  const [green, setGreen] = useState(false);
  const [sort, setSort] = useState('newest');
  const [rows, setRows] = useState<CommunityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moderator, setModerator] = useState(false);
  const [blocks, setBlocks] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [aliasError, setAliasError] = useState<string | null>(null);
  const request = useRef(0);
  const load = useCallback(async (offset = 0) => {
    const version = ++request.current;
    setBusy(true); setError(null);
    try {
      const result = await communityRpc<{ rows: CommunityRow[]; total: number }>('community_browse', {
        p_query: query.trim(), p_meal: meal, p_cuisine: cuisine, p_tags: tags, p_green: green, p_sort: sort, p_offset: offset,
      });
      if (request.current === version) { setRows((previous) => offset ? [...previous, ...result.rows] : result.rows); setTotal(result.total); }
      const names = await loadContributorAliases(result.rows.map((r) => r.user_id));
      if (request.current === version) { setAliases((previous) => offset ? { ...previous, ...names.aliases } : names.aliases); setAliasError(names.error); }
    } catch (e) { if (request.current === version) setError(e instanceof Error ? e.message : 'Could not load shared recipes.'); }
    finally { if (request.current === version) setBusy(false); }
  }, [query, meal, cuisine, tags, green, sort]);
  useFocusEffect(useCallback(() => {
    let active = true;
    communityRpc<boolean>('community_is_moderator').then((v) => { if (active) setModerator(v); }).catch((e) => { if (active) setError(e.message); });
    communityRpc<string[]>('community_my_blocks').then((v) => { if (active) setBlocks(v); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []));
  useFocusEffect(useCallback(() => {
    setBusy(true); setRows([]);
    const timer = setTimeout(() => void load(), 250);
    return () => { clearTimeout(timer); request.current++; };
  }, [load]));
  async function unblock(id: string) {
    setBusy(true);
    try { await communityRpc('community_block', { p_user: id, p_block: false }); setBlocks((old) => old.filter((v) => v !== id)); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unblocking failed.'); }
    finally { setBusy(false); }
  }
  const filterCount = Number(Boolean(meal)) + Number(Boolean(cuisine)) + tags.length + Number(green);
  return <Screen edges={[]}>
    <RecipeSourceNav active="shared" />
    <Body muted>Member-shared recipes · nutrition score is separate from cooking stars. Private recipes stay private.</Body>
    <TextField label="Search shared recipes" placeholder="Recipe or ingredient" value={query} onChangeText={(v) => setQuery(v.slice(0, 120))} />
    <ChipRow>
      {[['newest', 'Newest'], ['rating', 'Top rated'], ['nutrition', 'Nutrition score']].map(([key, label]) => <Chip key={key} label={label} selected={sort === key} onPress={() => setSort(key)} />)}
    </ChipRow>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Body>{busy ? 'Updating…' : error ? 'Results unavailable' : `${total} recipe${total === 1 ? '' : 's'} found`}</Body>
      <Button title={`Filters${filterCount ? ` (${filterCount})` : ''}`} variant="secondary" onPress={() => setShowFilters(true)} />
    </View>
    {filterCount ? <ChipRow>
      {meal ? <Chip label={`${meal} ×`} selected onPress={() => setMeal(null)} /> : null}
      {cuisine ? <Chip label={`${cuisine} ×`} selected onPress={() => setCuisine(null)} /> : null}
      {tags.map((tag) => <Chip key={tag} label={`${tag} ×`} selected onPress={() => setTags((selected) => selected.filter((item) => item !== tag))} />)}
      {green ? <Chip label="Green only ×" selected onPress={() => setGreen(false)} /> : null}
      <Chip label="Clear filters" onPress={() => { setMeal(null); setCuisine(null); setTags([]); setGreen(false); }} />
    </ChipRow> : null}
    {sort === 'rating' ? <Body muted>Top rated balances stars with review count, using five prior ratings at 3.5 stars. Unrated recipes are not presented as five-star favorites.</Body> : null}
    {aliasError ? <Notice>{aliasError}</Notice> : null}
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {error ? <Button title="Retry shared recipes" onPress={() => void load()} /> : null}
    {!busy && !error && rows.length === 0 ? <Body>No recipes match yet. Share an original recipe or change the filters.</Body> : null}
    {rows.map((r) => <Card key={r.id}>
      <Heading>{r.title}</Heading><Body muted>{r.meal} · {r.cuisine} · {contributorLabel(r.user_id, aliases)}</Body>
      <Body>{r.description}</Body><Body>{r.tags.join(' · ')}</Body>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm }}>
        <ScoreBadge score={r.nutrition_score} rating={r.nutrition_score === null ? 'unknown' : ratingFor(r.nutrition_score).key} size={44} />
        <View style={{ flex: 1 }}>
          <Body>{r.nutrition_score === null ? 'Nutrition estimate incomplete' : `${r.nutrition_score} · estimated score`}</Body>
          <Body muted>{r.review_count ? `★ ${r.average_rating} · ${r.review_count} cooking rating${r.review_count === 1 ? '' : 's'}` : 'No cooking ratings yet'}</Body>
        </View>
      </View>
      <Button title={`View ${r.title}`} variant="secondary" onPress={() => router.push({ pathname: '/community/[id]', params: { id: r.id } })} />
    </Card>)}
    <Button title="Share a recipe" variant="ghost" onPress={() => router.push('/community/publish')} />
    <PublicAliasCard />
    {rows.length < total ? <Button title="Load more recipes" loading={busy} onPress={() => void load(rows.length)} /> : null}
    {blocks.length ? <Card><Body>Blocked members</Body>{blocks.map((id) => <Button key={id} title={`Unblock ${memberLabel(id)}`} disabled={busy} variant="ghost" onPress={() => void unblock(id)} />)}</Card> : null}
    {moderator ? <Button title="Moderation reports" variant="secondary" onPress={() => router.push('/community/moderation')} /> : null}
    <Modal transparent visible={showFilters} animationType="slide" onRequestClose={() => setShowFilters(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable accessibilityLabel="Close filters" onPress={() => setShowFilters(false)} style={{ flex: 1 }} />
        <View style={{ maxHeight: '78%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Heading>Filter shared recipes</Heading>
            <Text style={[typography.subheading, { marginTop: spacing.md }]}>Meal</Text>
            <ChipRow><Chip label="All meals" selected={!meal} onPress={() => setMeal(null)} />{COMMUNITY_MEALS.map((value) => <Chip key={value} label={value} selected={meal === value} onPress={() => setMeal(value)} />)}</ChipRow>
            <Text style={[typography.subheading, { marginTop: spacing.md }]}>Cuisine</Text>
            <ChipRow><Chip label="All cuisines" selected={!cuisine} onPress={() => setCuisine(null)} />{COMMUNITY_CUISINES.map((value) => <Chip key={value} label={value} selected={cuisine === value} onPress={() => setCuisine(value)} />)}</ChipRow>
            <Text style={[typography.subheading, { marginTop: spacing.md }]}>Author-declared tags · all selected tags must match</Text>
            <ChipRow>{DIET_TAGS.map((value) => <Chip key={value} label={value} selected={tags.includes(value)} onPress={() => setTags((current) => current.includes(value) ? current.filter((tag) => tag !== value) : [...current, value])} />)}<Chip label="Green score only" selected={green} onPress={() => setGreen((current) => !current)} /></ChipRow>
            <Body muted>Not allergen certifications. Check ingredients, brands and cross-contact.</Body>
            <View style={{ height: spacing.md }} />
            <Button title="Show recipes" onPress={() => setShowFilters(false)} />
            <Button title="Clear filters" variant="ghost" onPress={() => { setMeal(null); setCuisine(null); setTags([]); setGreen(false); setShowFilters(false); }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  </Screen>;
}
