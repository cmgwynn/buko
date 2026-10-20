import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Empty, Heading, Notice, Screen, TextField } from '../../src/components/ui';
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
    const { error: e } = await supabase.from('grocery_items').insert({ user_id: session.user.id, name: trimmed, source: 'manual' });
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
        <Text style={[typography.body, item.checked && { textDecorationLine: 'line-through', color: colors.textMuted }]}>{item.name}</Text>
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
      <Heading>Grocery list</Heading>
      <View style={{ height: spacing.lg }} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField placeholder="Add an item" value={name} onChangeText={setName} onSubmitEditing={add} returnKeyType="done" />
        </View>
        <View style={{ width: 80 }}><Button title="Add" onPress={add} disabled={!name.trim()} /></View>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {items.length === 0 ? <Empty icon="cart-outline" text="Your list is empty. Add items here or from a scanned product." /> : null}
      {todo.length ? <Card>{todo.map(row)}</Card> : null}
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
