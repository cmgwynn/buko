import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Body, Button, Card, Chip, ChipRow, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { publishCommunity } from '../../src/lib/recipes/community';
import { COMMUNITY_CUISINES, COMMUNITY_MEALS, DIET_TAGS, dietaryWarnings, type DietTag } from '../../src/lib/recipes/communityPolicy';
import { loadRecipe, type RecipeFull } from '../../src/lib/recipes/db';
import { supabase } from '../../src/lib/supabase';

export default function PublishRecipe() {
  const { recipeId } = useLocalSearchParams<{ recipeId?: string }>();
  const router = useRouter();
  const [choices, setChoices] = useState<{ id: string; title: string }[]>([]);
  const [search, setSearch] = useState('');
  const [moreChoices, setMoreChoices] = useState(false);
  const [full, setFull] = useState<RecipeFull | null>(null);
  const [selected, setSelected] = useState(recipeId ?? '');
  const [description, setDescription] = useState('');
  const [changes, setChanges] = useState('');
  const [meal, setMeal] = useState<string>('Dinner');
  const [cuisine, setCuisine] = useState<string>('Everyday');
  const [tags, setTags] = useState<DietTag[]>([]);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (selected) return;
    let active = true;
    const timer = setTimeout(() => {
      supabase.from('recipes').select('id,title').ilike('title', `%${search}%`).order('created_at', { ascending: false }).limit(13).then(({ data, error: e }) => {
        if (!active) return;
        if (e) setError(e.message);
        else { setChoices((data ?? []).slice(0, 12)); setMoreChoices((data?.length ?? 0) > 12); }
      });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [selected, search]);
  useEffect(() => {
    setFull(null); setRights(false);
    if (!selected) return;
    let active = true;
    loadRecipe(selected).then((v) => { if (active) setFull(v); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [selected]);
  async function publish() {
    if (!full || !rights) return;
    setBusy(true); setError(null);
    try {
      const id = await publishCommunity({ recipeId: full.recipe.id, description, meal, cuisine, tags, confirmRights: rights,
        ...(full.recipe.community_parent_id ? { changes: changes.trim() } : {}) });
      router.replace({ pathname: '/community/[id]', params: { id } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Publishing failed.'); }
    finally { setBusy(false); }
  }
  return <Screen edges={[]}>
    <Heading>Share a recipe</Heading>
    <Body>Your private recipe stays private. Publishing makes a separate, fixed snapshot visible to signed-in members immediately. Future private edits do not change it or its reviews. Photos are not shared in this first version.</Body>
    {!selected ? <Card><Body>Choose a saved recipe. Search by title to narrow your library.</Body>
      <TextField label="Find a private recipe to share" value={search} onChangeText={setSearch} maxLength={120} />
      {choices.map((r) => <Button key={r.id} title={r.title} variant={selected === r.id ? 'primary' : 'ghost'} onPress={() => setSelected(r.id)} />)}
      {moreChoices ? <Body>Showing 12 recent matches. Refine your search to find another recipe.</Body> : null}
      {!choices.length ? <Body>No matching saved recipes. Save one first or change your search.</Body> : null}
    </Card> : null}
    {selected && !recipeId ? <Button title="Choose a different private recipe" variant="ghost" onPress={() => setSelected('')} /> : null}
    {full ? <>
      <Heading>{full.recipe.title}</Heading>
      <TextField label={full.recipe.community_parent_id ? 'About this recipe' : 'About this recipe / what makes it good'} value={description} onChangeText={setDescription} multiline maxLength={2000} />
      <Body>Meal</Body><ChipRow>{COMMUNITY_MEALS.map((v) => <Chip key={v} label={v} selected={meal === v} onPress={() => setMeal(v)} />)}</ChipRow>
      <Body>Cuisine (choose Everyday if no specific cultural claim)</Body><ChipRow>{COMMUNITY_CUISINES.map((v) => <Chip key={v} label={v} selected={cuisine === v} onPress={() => setCuisine(v)} />)}</ChipRow>
      <Body>Dietary tags you have checked</Body><ChipRow>{DIET_TAGS.map((v) => <Chip key={v} label={v} selected={tags.includes(v)} onPress={() => setTags(tags.includes(v) ? tags.filter((t) => t !== v) : [...tags, v])} />)}</ChipRow>
      <Body muted>Tags are self-declared, not certified. Check exact brands and all ingredients. Gluten-free oats, sauces and substitutes need particular care; cross-contact cannot be determined by Buko.</Body>
      {dietaryWarnings(tags, full.ingredients).map((warning) => <Notice key={warning}>{warning}</Notice>)}
      <Card><Body>Review exactly what will be shared</Body>
        <Body>{full.recipe.servings} servings</Body>
        {full.ingredients.map((i) => <Body key={i.id}>• {i.raw_text}</Body>)}
        {full.steps.map((s, i) => <Body key={s.id}>{i + 1}. {s.text}</Body>)}
        <Body muted>The server calculates Buko&apos;s estimated score from the saved ingredient data. Any missing weight or nutrient means no score—not a misleading green badge. Submitted nutrition is not independently verified.</Body>
      </Card>
      {full.recipe.community_parent_id ? <>
        <Body>This will be linked as a variation of the original shared recipe, with its own score and reviews.</Body>
        <TextField label="What changed from the original" value={changes} onChangeText={setChanges} multiline maxLength={1000}
          placeholder="e.g. Swapped cream for Greek yogurt and added spinach" />
      </> : null}
      {full.recipe.source_url ? <Notice>This is an imported recipe. Importing for personal use does not grant permission to republish someone else&apos;s instructions or photos. Only continue if you have the rights to share this text.</Notice> : null}
      <Chip label="I confirm sharing permission" selected={rights} onPress={() => setRights(!rights)} />
      <Body>I wrote this recipe or have permission to share it. I removed personal information. I allow members to save, cook and adapt it for personal use in Buko. I will not post abuse, spam, stolen content or dangerous health claims. Contributions can be reported or removed. I can withdraw my shared recipe; private copies already saved by others remain.</Body>
      <Button title="Publish to members" loading={busy} disabled={!rights || !description.trim() || (!!full.recipe.community_parent_id && changes.trim().length < 3)} onPress={() => void publish()} />
    </> : null}
    {error ? <Notice tone="danger">{error}</Notice> : null}
  </Screen>;
}
