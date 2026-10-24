import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Body, Button, Card, Chip, ChipRow, Heading, Loading, Notice, Screen, TextField } from '../../src/components/ui';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { FactorCard } from '../../src/components/FactorCard';
import { communityRpc, memberLabel, type CommunityDetail } from '../../src/lib/recipes/community';
import { communityCopy, dietaryWarnings } from '../../src/lib/recipes/communityPolicy';
import { setDraft } from '../../src/lib/recipes/draft';
import { ratingFor } from '../../src/lib/scoring';
import { computeRecipeNutrition, scoreRecipe } from '../../src/lib/recipes/nutrition';
import { useAuth } from '../../src/providers/AuthProvider';

export default function SharedRecipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ id: string; kind: 'recipe' | 'review' } | null>(null);
  const [reason, setReason] = useState('');
  const [withdraw, setWithdraw] = useState(false);
  const [explain, setExplain] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    setDetail(null); setError(null); setMessage(null); setReport(null); setWithdraw(false);
    communityRpc<CommunityDetail>('community_detail', { p_id: id }).then((d) => {
      if (active) { setDetail(d); setStars(d.myReview?.stars ?? 0); setBody(d.myReview?.body ?? ''); }
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id]));
  async function act(action: () => Promise<void>) {
    setBusy(true); setError(null); setMessage(null);
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Recipe action failed.'); }
    finally { setBusy(false); }
  }
  async function refresh() {
    const next = await communityRpc<CommunityDetail>('community_detail', { p_id: id });
    setDetail(next); setStars(next.myReview?.stars ?? 0); setBody(next.myReview?.body ?? '');
  }
  if (!detail) return <Screen edges={[]}>{error ? <Notice tone="danger">{error}</Notice> : <Loading />}</Screen>;
  const { recipe: r, reviews, variations } = detail;
  const mine = r.user_id === session?.user.id;
  const scoreDetails = r.nutrition_score === null ? null : scoreRecipe(r.title, computeRecipeNutrition(r.payload.ingredients, r.payload.servings));
  const open = (recipeId: string) => router.push({ pathname: '/community/[id]', params: { id: recipeId } });
  return <Screen edges={[]}>
    <Heading>{r.title}</Heading><Body muted>{r.meal} · {r.cuisine} · {memberLabel(r.user_id)}</Body>
    <Body>{r.description}</Body>
    {r.parent_id ? <Button title="View original shared recipe" variant="ghost" onPress={() => open(r.parent_id!)} /> : null}
    <Card>
      <ScoreBadge score={r.nutrition_score} rating={r.nutrition_score === null ? 'unknown' : ratingFor(r.nutrition_score).key} />
      <Body>{r.nutrition_score === null ? 'Nutrition score unavailable: match every ingredient and nutrient to score it.' : `${ratingFor(r.nutrition_score).label} · estimated Buko nutrition score · ${Math.round(r.calories ?? 0)} kcal/serving`}</Body>
      <Body muted>Buko nutrition scores are out of 100, separate from cooking ratings. Estimates use contributor-supplied ingredient weights and nutrition; not independently verified. Processing/additives and measured cooked yield are not included. A high score is not a guarantee of dietary suitability.</Body>
      <Body>{detail.reviewCount ? `${detail.averageRating} stars · ${detail.reviewCount} member rating${detail.reviewCount === 1 ? '' : 's'}` : 'Not yet rated by members'}</Body>
      {scoreDetails ? <Button title={explain ? 'Hide nutrition explanation' : 'Explain nutrition score'} variant="ghost" onPress={() => setExplain(!explain)} /> : null}
      {scoreDetails && explain ? <>
        <Body muted>Current scoring model, based on the published ingredient snapshot. Stored publication score: {r.nutrition_score}. Scoring rules may change in future releases.</Body>
        {scoreDetails.factors.map((factor) => <FactorCard key={factor.id} factor={factor} totalWeight={scoreDetails.factors.reduce((sum, f) => sum + f.weight, 0)} />)}
      </> : null}
    </Card>
    <Body>Author-declared dietary tags: {r.tags.join(', ') || 'None'}</Body>
    <Body muted>Not certified vegan, gluten-free or allergen-safe. Check brands, preparation and cross-contact. Missing tags do not establish suitability.</Body>
    {dietaryWarnings(r.tags, r.payload.ingredients).map((warning) => <Notice key={warning}>{warning}</Notice>)}
    <Button title="Save or modify a private copy" onPress={() => { setDraft(communityCopy(r.payload, r.id)); router.push('/recipe/edit'); }} />
    <Body muted>Review ingredients, edit and save. Your copy works with the existing planner, grocery list and cooking mode. To share your changes, publish that saved copy as a linked variation; its score is recalculated.</Body>
    <Card><Heading>Ingredients</Heading><Body>{r.payload.servings} serving{r.payload.servings === 1 ? '' : 's'} · {(r.payload.prepMinutes ?? 0) + (r.payload.cookMinutes ?? 0)} min</Body>
      {r.payload.ingredients.map((i) => <Card key={i.position}>
        <Body>• {i.raw_text}</Body>
        <Body muted>{i.food_source === 'manual' ? 'Contributor-entered nutrition' : i.food_source ? `Contributor-matched ${i.food_source.toUpperCase()} nutrition` : 'No nutrition source'}</Body>
        {i.food_source === 'usda' && /^\d+$/.test(i.food_source_id ?? '') ? <Link href={`https://fdc.nal.usda.gov/food-details/${i.food_source_id}/nutrients`} target="_blank">USDA ingredient reference</Link> : null}
      </Card>)}
    </Card>
    <Card><Heading>Steps</Heading>{r.payload.steps.map((s) => <Body key={s.position}>{s.position + 1}. {s.text}</Body>)}</Card>
    {variations.length ? <Card><Heading>Recipe variations</Heading><Body muted>Latest 20 shared variations; each has independent nutrition and reviews.</Body>
      {variations.map((v) => <Button key={v.id} title={v.title} variant="ghost" onPress={() => open(v.id)} />)}
    </Card> : null}
    <Heading>Ratings & reviews</Heading>
    <Body muted>Latest 50 reviews. Share what you cooked, ingredient swaps, quantities and results—not medical advice, personal information or abuse. One rating per member; authors cannot rate their own recipes.</Body>
    {reviews.map((v) => <Card key={v.id}>
      <Body>{v.stars} stars · {memberLabel(v.user_id)}</Body><Body>{v.body || 'Rating only'}</Body>
      {v.user_id !== session?.user.id ? <>
        <Button title={`Report review by ${memberLabel(v.user_id)}`} disabled={busy} variant="ghost" onPress={() => { setReport({ id: v.id, kind: 'review' }); setReason(''); }} />
        <Button title={`Block ${memberLabel(v.user_id)}`} disabled={busy} variant="ghost" onPress={() => void act(async () => {
          await communityRpc('community_block', { p_user: v.user_id, p_block: true }); await refresh(); setMessage('Member blocked. Their content is hidden; unblock from Shared recipes.');
        })} />
      </> : null}
    </Card>)}
    {!mine ? <Card><Heading>{detail.myReview ? 'Edit your review' : 'Rate this recipe'}</Heading>
      <ChipRow>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={`${n} star${n === 1 ? '' : 's'}`} selected={stars === n} onPress={() => setStars(n)} />)}</ChipRow>
      <TextField label="Your cooking review or modifications (optional)" value={body} onChangeText={setBody} multiline maxLength={3000} />
      <Button title="Save my review" disabled={!stars} loading={busy} onPress={() => void act(async () => {
        await communityRpc('community_review', { p_recipe: id, p_stars: stars, p_body: body }); await refresh(); setMessage('Your review is published.');
      })} />
      {detail.myReview ? <Button title="Delete my review" disabled={busy} variant="danger" onPress={() => void act(async () => {
        await communityRpc('community_remove', { p_id: detail.myReview!.id, p_kind: 'review' }); await refresh(); setMessage('Review deleted.');
      })} /> : null}
    </Card> : null}
    {!mine ? <>
      <Button title="Report this recipe" disabled={busy} variant="ghost" onPress={() => { setReport({ id, kind: 'recipe' }); setReason(''); }} />
      <Button title="Block recipe contributor" disabled={busy} variant="ghost" onPress={() => void act(async () => {
        await communityRpc('community_block', { p_user: r.user_id, p_block: true }); router.replace('/community');
      })} />
    </> : <Button title="Withdraw my shared recipe" variant="danger" disabled={busy} onPress={() => setWithdraw(!withdraw)} />}
    {withdraw ? <Card><Body>Stop sharing this recipe? Your private original stays saved. Copies already saved by other members remain private to them. This snapshot cannot be republished.</Body>
      <Button title="Confirm withdrawal" variant="danger" loading={busy} onPress={() => void act(async () => {
        await communityRpc('community_remove', { p_id: id, p_kind: 'recipe' }); router.replace('/community');
      })} />
      <Button title="Keep shared recipe" variant="ghost" onPress={() => setWithdraw(false)} />
    </Card> : null}
    {report ? <Card><Heading>Report {report.kind}</Heading>
      <Body>Tell moderators about unsafe advice, stolen content, harassment, incorrect dietary tags or spam. Reports are not shown to other members. Reporting does not automatically remove content.</Body>
      <TextField label="Reason for reporting" value={reason} onChangeText={setReason} multiline maxLength={2000} />
      <Button title="Submit report" loading={busy} disabled={reason.trim().length < 5} onPress={() => void act(async () => {
        await communityRpc('community_report', { p_id: report.id, p_kind: report.kind, p_reason: reason }); setReport(null); setMessage('Report sent to moderators. You can also block the contributor.');
      })} />
      <Button title="Cancel report" variant="ghost" onPress={() => setReport(null)} />
    </Card> : null}
    {message ? <Notice tone="info">{message}</Notice> : null}
    {error ? <Notice tone="danger">{error}</Notice> : null}
  </Screen>;
}
