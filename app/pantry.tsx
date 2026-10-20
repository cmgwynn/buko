import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Empty, Notice, Screen, TextField } from '../src/components/ui';
import { parseIngredient } from '../src/lib/recipes/ingredientParser';
import { canonicalName, sectionFor } from '../src/lib/recipes/sections';
import { SECTIONS, type PantryItem } from '../src/lib/recipes/types';
import { formatQuantity } from '../src/lib/recipes/units';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/providers/AuthProvider';
import { colors, spacing, typography } from '../src/theme';

export default function Pantry() {
  const { session } = useAuth();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('pantry_items').select('*').order('name');
    if (e) setError(e.message);
    else {
      setError(null);
      setItems(data as PantryItem[]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    const t = text.trim();
    if (!t || !session) return;
    const p = parseIngredient(t);
    const canonical = canonicalName(p.name);
    if (!canonical) return;
    setText('');
    const { error: e } = await supabase.from('pantry_items').upsert(
      {
        user_id: session.user.id,
        name: p.name,
        canonical_name: canonical,
        quantity: p.quantity,
        unit: p.unit,
        section: sectionFor(p.name),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,canonical_name' },
    );
    if (e) setError(e.message);
    load();
  }

  async function remove(item: PantryItem) {
    setItems((cur) => cur.filter((i) => i.id !== item.id));
    await supabase.from('pantry_items').delete().eq('id', item.id);
  }

  return (
    <Screen edges={[]}>
      <Body muted>
        Add what you already have. When you make a grocery list from your meal plan, these are subtracted. Type just a name (“olive oil”) if you always have it, or include an amount (“500 g rice”) to subtract only that much.
      </Body>
      <View style={{ height: spacing.lg }} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField placeholder="e.g. olive oil, or 500 g rice" value={text} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" />
        </View>
        <View style={{ width: 80 }}><Button title="Add" onPress={add} disabled={!text.trim()} /></View>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {items.length === 0 ? <Empty icon="file-tray-outline" text="Your pantry is empty." /> : null}
      {SECTIONS.map(({ key, label }) => {
        const inSection = items.filter((i) => i.section === key);
        if (!inSection.length) return null;
        return (
          <Card key={key}>
            <Text style={typography.label}>{label}</Text>
            {inSection.map((i) => (
              <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm }}>
                <Text style={[typography.body, { flex: 1 }]}>{i.name}</Text>
                {i.quantity !== null ? <Text style={[typography.body, { color: colors.textMuted, marginRight: spacing.md }]}>{formatQuantity(i.quantity)}{i.unit ? ' ' + i.unit : ''}</Text> : null}
                <Pressable onPress={() => remove(i)} hitSlop={10} accessibilityLabel={`Remove ${i.name}`}>
                  <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}
