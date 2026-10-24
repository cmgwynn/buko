import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Body, Button, Card, Chip, ChipRow, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { communityRpc, memberLabel, type CommunityRow } from '../../src/lib/recipes/community';
import { COMMUNITY_CUISINES, COMMUNITY_MEALS, DIET_TAGS, type DietTag } from '../../src/lib/recipes/communityPolicy';
import { ratingFor } from '../../src/lib/scoring';

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
  const request = useRef(0);
  const load = useCallback(async (offset = 0) => {
    const version = ++request.current;
    setBusy(true); setError(null);
    try {
      const result = await communityRpc<{ rows: CommunityRow[]; total: number }>('community_browse', {
        p_query: query.trim(), p_meal: meal, p_cuisine: cuisine, p_tags: tags, p_green: green, p_sort: sort, p_offset: offset,
      });
      if (request.current === version) { setRows((previous) => offset ? [...previous, ...result.rows] : result.rows); setTotal(result.total); }
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
  return <Screen edges={[]}>
    <Heading>Cook, share, make it your own</Heading>
    <Body muted>Members-only recipes. Nutrition scores are estimates; stars are members&apos; cooking ratings. Nothing from your private library is shared automatically.</Body>
    <Button title="Share one of my recipes" onPress={() => router.push('/community/publish')} />
    <TextField label="Search recipes or ingredients" value={query} onChangeText={(v) => setQuery(v.slice(0, 120))} />
    <ChipRow>
      {[['newest', 'Newest'], ['rating', 'Top rated'], ['nutrition', 'Nutrition score']].map(([key, label]) => <Chip key={key} label={label} selected={sort === key} onPress={() => setSort(key)} />)}
      <Chip label="Green only" selected={green} onPress={() => setGreen(!green)} />
    </ChipRow>
    <Button title={showFilters ? 'Hide categories' : 'Meal, cuisine & dietary filters'} variant="ghost" onPress={() => setShowFilters(!showFilters)} />
    {showFilters ? <Card>
      <Body>Meal</Body><ChipRow><Chip label="All meals" selected={!meal} onPress={() => setMeal(null)} />{COMMUNITY_MEALS.map((v) => <Chip key={v} label={v} selected={meal === v} onPress={() => setMeal(v)} />)}</ChipRow>
      <Body>Cuisine</Body><ChipRow><Chip label="All cuisines" selected={!cuisine} onPress={() => setCuisine(null)} />{COMMUNITY_CUISINES.map((v) => <Chip key={v} label={v} selected={cuisine === v} onPress={() => setCuisine(v)} />)}</ChipRow>
      <Body>Author-declared dietary tags (all selected tags must match)</Body>
      <ChipRow>{DIET_TAGS.map((v) => <Chip key={v} label={v} selected={tags.includes(v)} onPress={() => setTags(tags.includes(v) ? tags.filter((t) => t !== v) : [...tags, v])} />)}</ChipRow>
      <Body muted>Not allergen certifications. Check ingredient brands, substitutions and cross-contact yourself.</Body>
      <Button title="Clear filters" variant="ghost" onPress={() => { setMeal(null); setCuisine(null); setTags([]); setGreen(false); setQuery(''); }} />
    </Card> : null}
    {sort === 'rating' ? <Body muted>Top rated balances stars with review count, using five prior ratings at 3.5 stars. Unrated recipes are not presented as five-star favorites.</Body> : null}
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {error ? <Button title="Retry shared recipes" onPress={() => void load()} /> : null}
    {!error ? <Body>{busy ? 'Loading…' : `${total} recipe${total === 1 ? '' : 's'} found`}</Body> : null}
    {!busy && !error && rows.length === 0 ? <Body>No recipes match yet. Share an original recipe or change the filters.</Body> : null}
    {rows.map((r) => <Card key={r.id}>
      <Heading>{r.title}</Heading><Body muted>{r.meal} · {r.cuisine} · {memberLabel(r.user_id)}</Body>
      <Body>{r.description}</Body><Body>{r.tags.join(' · ')}</Body>
      <ScoreBadge score={r.nutrition_score} rating={r.nutrition_score === null ? 'unknown' : ratingFor(r.nutrition_score).key} size={48} />
      <Body muted>{r.nutrition_score === null ? 'Nutrition score unavailable: incomplete matching' : `Estimated Buko nutrition score · ${Math.round(r.calories ?? 0)} kcal/serving`}</Body>
      <Body>{r.review_count ? `${r.average_rating} stars · ${r.review_count} rating${r.review_count === 1 ? '' : 's'}` : 'Not yet rated'}</Body>
      <Button title={`View ${r.title}`} variant="secondary" onPress={() => router.push({ pathname: '/community/[id]', params: { id: r.id } })} />
    </Card>)}
    {rows.length < total ? <Button title="Load more recipes" loading={busy} onPress={() => void load(rows.length)} /> : null}
    {blocks.length ? <Card><Body>Blocked members</Body>{blocks.map((id) => <Button key={id} title={`Unblock ${memberLabel(id)}`} disabled={busy} variant="ghost" onPress={() => void unblock(id)} />)}</Card> : null}
    {moderator ? <Button title="Moderation reports" variant="secondary" onPress={() => router.push('/community/moderation')} /> : null}
  </Screen>;
}
