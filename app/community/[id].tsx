import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Chip, ChipRow, Disclosure, Heading, Loading, Notice, Screen, TextField } from '../../src/components/ui';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { FactorCard } from '../../src/components/FactorCard';
import { communityRpc, loadContributorAliases, type CommunityDetail } from '../../src/lib/recipes/community';
import { contributorLabel } from '../../src/lib/recipes/communityProfiles';
import { communityCopy, dietaryWarnings } from '../../src/lib/recipes/communityPolicy';
import { setDraft } from '../../src/lib/recipes/draft';
import { ratingFor } from '../../src/lib/scoring';
import { computeRecipeNutrition, scoreRecipe } from '../../src/lib/recipes/nutrition';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, spacing, typography } from '../../src/theme';

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [reviewMenu, setReviewMenu] = useState<string | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [aliasError, setAliasError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setDetail(null); setError(null); setMessage(null); setReport(null); setWithdraw(false);
    communityRpc<CommunityDetail>('community_detail', { p_id: id }).then((d) => {
      if (!active) return;
      setDetail(d); setStars(d.myReview?.stars ?? 0); setBody(d.myReview?.body ?? '');
      void loadContributorAliases([d.recipe.user_id, ...d.reviews.map((v) => v.user_id)]).then((result) => {
        if (active) { setAliases(result.aliases); setAliasError(result.error); }
      });
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
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}><Heading>{r.title}</Heading></View>
      {!mine ? <Pressable accessibilityRole="button" accessibilityLabel="More recipe actions" accessibilityState={{ expanded: moreOpen }} aria-expanded={moreOpen} hitSlop={10} onPress={() => setMoreOpen((open) => !open)} style={{ padding: spacing.sm }}>
        <Ionicons name="ellipsis-horizontal" size={24} color={colors.primary} />
      </Pressable> : null}
    </View>
    {moreOpen && !mine ? <Card>
      <Button title="Report this recipe" disabled={busy} variant="ghost" onPress={() => { setReport({ id, kind: 'recipe' }); setReason(''); setMoreOpen(false); }} />
      <Button title="Block contributor" disabled={busy} variant="ghost" onPress={() => { setMoreOpen(false); void act(async () => {
        await communityRpc('community_block', { p_user: r.user_id, p_block: true }); router.replace('/community');
      }); }} />
    </Card> : null}
    <Body muted>{r.meal} · {r.cuisine} · {contributorLabel(r.user_id, aliases)}</Body>
    {aliasError ? <Notice>{aliasError}</Notice> : null}
    <Body>{r.description}</Body>
    {r.parent_id ? <Card><Text style={typography.label}>What changed from the original</Text>
      <Body>{r.change_summary || 'Shared before change notes were available. Compare with the original recipe.'}</Body></Card> : null}
    {r.parent_id ? <Button title="View original shared recipe" variant="ghost" onPress={() => open(r.parent_id!)} /> : null}
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <ScoreBadge score={r.nutrition_score} rating={r.nutrition_score === null ? 'unknown' : ratingFor(r.nutrition_score).key} />
        <View style={{ flex: 1 }}>
          <Body>{r.nutrition_score === null ? 'Nutrition estimate incomplete' : `${ratingFor(r.nutrition_score).label} · estimated score`}</Body>
          <Body muted>{r.nutrition_score === null ? 'Match every ingredient and nutrient to score it.' : `${Math.round(r.calories ?? 0)} kcal per serving`}</Body>
        </View>
      </View>
      <Body>{detail.reviewCount ? `★ ${detail.averageRating} · ${detail.reviewCount} cooking rating${detail.reviewCount === 1 ? '' : 's'}` : 'No cooking ratings yet'}</Body>
      <Body muted>Nutrition score is separate from cooking stars. Estimate uses contributor data, not verified yield.</Body>
      {scoreDetails ? <Button title={explain ? 'Hide nutrition explanation' : 'Explain nutrition score'} variant="ghost" onPress={() => setExplain(!explain)} /> : null}
      {scoreDetails && explain ? <>
        <Body muted>Current scoring model, based on the published ingredient snapshot. Stored publication score: {r.nutrition_score}. Scoring rules may change in future releases.</Body>
        {scoreDetails.factors.map((factor) => <FactorCard key={factor.id} factor={factor} totalWeight={scoreDetails.factors.reduce((sum, f) => sum + f.weight, 0)} />)}
      </> : null}
    </Card>
    <Body>Author tags: {r.tags.join(' · ') || 'None'}</Body>
    <Body muted>Tags are not allergy or safety certifications. Check ingredients and cross-contact.</Body>
    <Disclosure title="Dietary and allergen safety">
      <Body muted>Tags are contributor-declared, not certified. Check brands and preparation. Missing tags do not establish suitability.</Body>
      {dietaryWarnings(r.tags, r.payload.ingredients).map((warning) => <Notice key={warning}>{warning}</Notice>)}
    </Disclosure>
    <Button title="Save a copy" onPress={() => { setDraft(communityCopy(r.payload, r.id)); router.push('/recipe/edit'); }} />
    <Body muted>Review and edit your private copy before saving. To share changes, publish it as a linked variation with a description of what changed.</Body>
    <Card><Heading>Ingredients</Heading><Body>{r.payload.servings} serving{r.payload.servings === 1 ? '' : 's'} · {(r.payload.prepMinutes ?? 0) + (r.payload.cookMinutes ?? 0)} min</Body>
      {r.payload.ingredients.map((i) => <View key={i.position} style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Body>• {i.raw_text}</Body>
        <Body muted>{i.food_source === 'manual' ? 'Contributor-entered nutrition' : i.food_source ? `Contributor-matched ${i.food_source.toUpperCase()} nutrition` : 'No nutrition source'}</Body>
        {i.food_source === 'usda' && /^\d+$/.test(i.food_source_id ?? '') ? <Link href={`https://fdc.nal.usda.gov/food-details/${i.food_source_id}/nutrients`} target="_blank">USDA ingredient reference</Link> : null}
      </View>)}
    </Card>
    <Card><Heading>Steps</Heading>{r.payload.steps.map((s) => <Body key={s.position}>{s.position + 1}. {s.text}</Body>)}</Card>
    {variations.length ? <Card><Heading>Recipe variations</Heading><Body muted>Latest 20 shared variations; each has independent nutrition and reviews.</Body>
      {variations.map((v) => <Button key={v.id} title={v.title} variant="ghost" onPress={() => open(v.id)} />)}
    </Card> : null}
    <Heading>Ratings & reviews</Heading>
    <Body muted>Latest 50 reviews. Share what you cooked, ingredient swaps, quantities and results—not medical advice, personal information or abuse. One rating per member; authors cannot rate their own recipes.</Body>
    {reviews.map((v) => <Card key={v.id}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body>★ {v.stars} · {contributorLabel(v.user_id, aliases)}</Body>
        {v.user_id !== session?.user.id ? <Pressable accessibilityRole="button" accessibilityLabel={`More actions for review by ${contributorLabel(v.user_id, aliases)}`} accessibilityState={{ expanded: reviewMenu === v.id }} aria-expanded={reviewMenu === v.id} onPress={() => setReviewMenu(reviewMenu === v.id ? null : v.id)} hitSlop={10} style={{ padding: spacing.xs }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.primary} />
        </Pressable> : null}
      </View>
      <Body>{v.body || 'Rating only'}</Body>
      {reviewMenu === v.id ? <>
        <Button title="Report review" disabled={busy} variant="ghost" onPress={() => { setReport({ id: v.id, kind: 'review' }); setReason(''); setReviewMenu(null); }} />
        <Button title="Block member" disabled={busy} variant="ghost" onPress={() => { setReviewMenu(null); void act(async () => {
          await communityRpc('community_block', { p_user: v.user_id, p_block: true }); await refresh(); setMessage('Member blocked. Their content is hidden; unblock from Shared recipes.');
        }); }} />
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
    {mine ? <Button title="Withdraw my shared recipe" variant="danger" disabled={busy} onPress={() => setWithdraw(!withdraw)} /> : null}
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
