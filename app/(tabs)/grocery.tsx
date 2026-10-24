import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TabHeader } from '../../src/components/TabHeader';
import { Button, Card, Empty, Notice, Screen, TextField } from '../../src/components/ui';
import { sectionFor } from '../../src/lib/recipes/sections';
import { SECTIONS } from '../../src/lib/recipes/types';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, spacing, typography } from '../../src/theme';
import type { GroceryItem } from '../../src/types';

export default function Grocery() {
  const router = useRouter();
  const { session } = useAuth();
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('grocery_items').select('*').order('created_at', { ascending: false });
    if (e) setError(e.message);
    else {
      setError(null);
      setItems(data as GroceryItem[]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || !session) return;
    setName('');
    const { error: e } = await supabase.from('grocery_items').insert({ user_id: session.user.id, name: trimmed, source: 'manual', section: sectionFor(trimmed) });
    if (e) setError(e.message);
    load();
  }

  async function toggle(item: GroceryItem) {
    const checked = !item.checked;
    // Optimistic update so check-off feels instant in the aisle.
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, checked } : i)));
    const { error: e } = await supabase.from('grocery_items').update({ checked, checked_at: checked ? new Date().toISOString() : null }).eq('id', item.id);
    if (e) {
      setError(e.message);
      load();
    }
  }

  async function remove(item: GroceryItem) {
    setItems((cur) => cur.filter((i) => i.id !== item.id));
    await supabase.from('grocery_items').delete().eq('id', item.id);
  }

  async function clearChecked() {
    setItems((cur) => cur.filter((i) => !i.checked));
    await supabase.from('grocery_items').delete().eq('checked', true);
  }

  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  const row = (item: GroceryItem) => (
    <Pressable key={item.id} onPress={() => toggle(item)} accessibilityRole="checkbox" accessibilityState={{ checked: item.checked }}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md }}>
      <Ionicons name={item.checked ? 'checkbox' : 'square-outline'} size={26} color={item.checked ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={[typography.body, item.checked && { textDecorationLine: 'line-through', color: colors.textMuted }]}>
          {item.name}{item.quantity ? ` · ${item.quantity}` : ''}
        </Text>
        {item.from_recipes?.length ? <Text style={typography.small} numberOfLines={1}>For {item.from_recipes.join(', ')}</Text> : null}
      </View>
      {item.barcode ? (
        <Pressable onPress={() => router.push({ pathname: '/product/[barcode]', params: { barcode: item.barcode! } })} hitSlop={10} accessibilityLabel="View product score" style={{ marginRight: spacing.md }}>
          <Ionicons name="leaf-outline" size={20} color={colors.primary} />
        </Pressable>
      ) : null}
      <Pressable onPress={() => remove(item)} hitSlop={10} accessibilityLabel={`Remove ${item.name}`}>
        <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );

  return (
    <Screen>
      <TabHeader
        title="Grocery"
        backFallback="/(tabs)/plan"
        right={
          <Pressable onPress={() => router.push('/pantry')} hitSlop={10} accessibilityLabel="Pantry">
            <Ionicons name="file-tray-full-outline" size={24} color={colors.primary} />
          </Pressable>
        }
      />
      <Button title="Make list from meal plan" icon="calendar-outline" variant="secondary" onPress={() => router.push('/grocery/generate')} />
      <View style={{ height: spacing.md }} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField placeholder="Add an item" value={name} onChangeText={setName} onSubmitEditing={add} returnKeyType="done" />
        </View>
        <View style={{ width: 80 }}><Button title="Add" onPress={add} disabled={!name.trim()} /></View>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {items.length === 0 ? <Empty icon="cart-outline" text="Your list is empty. Add items here or from a scanned product." /> : null}
      {SECTIONS.map(({ key, label }) => {
        const inSection = todo.filter((i) => (i.section ?? 'other') === key);
        return inSection.length ? (
          <View key={key}>
            <Text style={[typography.label, { marginTop: spacing.sm, marginBottom: spacing.xs }]}>{label}</Text>
            <Card>{inSection.map(row)}</Card>
          </View>
        ) : null;
      })}
      {done.length ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
            <Text style={typography.label}>In the cart ({done.length})</Text>
            <Button title="Clear" variant="ghost" onPress={clearChecked} />
          </View>
          <Card>{done.map(row)}</Card>
        </>
      ) : null}
    </Screen>
  );
}
