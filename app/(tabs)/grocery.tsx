import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { TabHeader } from '../../src/components/TabHeader';
import { Body, Button, Card, Disclosure, Empty, Loading, NavigationRow, Notice, Screen, TextField } from '../../src/components/ui';
import { groceryCacheKey, queueGroceryCheck, readGroceryCache, writeGroceryCache, type GroceryCache } from '../../src/lib/recipes/offlineGroceries';
import { sectionFor } from '../../src/lib/recipes/sections';
import { SECTIONS } from '../../src/lib/recipes/types';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { accountStorageWrites } from '../../src/lib/account/storageWrites';
import { colors, spacing, typography } from '../../src/theme';
import type { GroceryItem } from '../../src/types';

export default function Grocery() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const confirm = useConfirm();
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [removed, setRemoved] = useState<GroceryItem[]>([]);
  const cache = useRef<GroceryCache | null>(null);
  const owner = useRef(userId);
  owner.current = userId;
  const running = useRef(false);
  const syncFailed = useRef(false);

  const persist = useCallback(async (value: GroceryCache) => {
    if (!userId || owner.current !== userId) return;
    const written = await accountStorageWrites.run(userId, async () => { await writeGroceryCache(AsyncStorage, userId, value); });
    if (!written) throw new Error('Your account changed. The offline list was not saved.');
    if (owner.current !== userId) {
      await AsyncStorage.removeItem(groceryCacheKey(userId));
      return;
    }
    cache.current = value; setPendingCount(value.pending.length);
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId || running.current) return;
    running.current = true; setBusy(true);
    try {
      const saved = await readGroceryCache(AsyncStorage, userId);
      if (owner.current !== userId) return;
      cache.current = saved; setOffline(!!saved); setPendingCount(saved?.pending.length ?? 0);
      if (saved) { setItems(saved.items); setLoaded(true); }
      if (saved?.pending.length) {
        for (const change of [...saved.pending]) {
          const result = await supabase.from('grocery_items').update({ checked: change.checked, checked_at: change.checked ? change.at : null }).eq('id', change.id).select('id');
          if (result.error) throw new Error(`Checkmarks are pending, not synced: ${result.error.message}`);
          if (!result.data?.length) {
            setMessage('A pending item was removed from the server list. Its checkmark was not applied.');
          }
          const updated = { ...cache.current!, pending: cache.current!.pending.filter((p) => p.id !== change.id) };
          await persist(updated);
        }
      }
      const { data, error: e } = await supabase.from('grocery_items').select('*').order('created_at', { ascending: false });
      if (e) throw new Error(`${saved ? 'Showing your saved list. ' : ''}Could not refresh groceries: ${e.message}`);
      if (owner.current !== userId) return;
      syncFailed.current = false;
      setError(null);
      setItems(data as GroceryItem[]);
      if (cache.current) await persist({ version: 1, savedAt: Date.now(), items: data as GroceryItem[], pending: [] });
      if (saved?.pending.length) setMessage('Checkmarks synced.');
    } catch (e) {
      syncFailed.current = true;
      if (owner.current === userId) setError(e instanceof Error ? e.message : 'Could not load groceries. Please retry.');
    } finally {
      if (owner.current === userId) { setLoaded(true); setBusy(false); }
      running.current = false;
    }
  }, [userId, persist]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const online = () => { void load(); };
    globalThis.addEventListener('online', online);
    return () => globalThis.removeEventListener('online', online);
  }, [load]);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || !session || running.current) return;
    running.current = true; setBusy(true); setError(null);
    const { error: e } = await supabase.from('grocery_items').insert({ user_id: session.user.id, name: trimmed, source: 'manual', section: sectionFor(trimmed) });
    running.current = false; setBusy(false);
    if (e) { setError(`Item was not added. Your text is kept: ${e.message}`); return; }
    setName(''); setMessage('Item added.'); await load();
  }

  async function toggle(item: GroceryItem) {
    if (running.current || !userId) return;
    const checked = !item.checked;
    if (cache.current) {
      try {
        running.current = true;
        const next = queueGroceryCheck(cache.current, item.id, checked);
        await persist(next);
        setItems(next.items); setMessage('Checkmark saved on this device; syncing when connected.');
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not keep this checkmark.'); }
      finally { running.current = false; }
      if (!syncFailed.current && !(Platform.OS === 'web' && !globalThis.navigator.onLine)) await load();
      return;
    }
    running.current = true; setBusy(true); setError(null);
    const { error: e } = await supabase.from('grocery_items').update({ checked, checked_at: checked ? new Date().toISOString() : null }).eq('id', item.id);
    if (e) setError(`Checkmark was not saved: ${e.message}`);
    else { setItems((cur) => cur.map((i) => i.id === item.id ? { ...i, checked } : i)); setMessage('Checkmark saved.'); }
    running.current = false; setBusy(false);
  }

  async function remove(item: GroceryItem) {
    if (running.current || pendingCount) return;
    running.current = true; setBusy(true); setError(null);
    const { error: e } = await supabase.from('grocery_items').delete().eq('id', item.id);
    running.current = false; setBusy(false);
    if (e) { setError(`Item was not removed: ${e.message}`); return; }
    setRemoved([item]); setMessage('Item removed.'); await load();
  }

  async function clearChecked() {
    if (running.current || pendingCount || !await confirm({ title: 'Clear checked items?', message: 'Unchecked items stay on your list. You can undo this until your next removal.', confirmLabel: 'Clear checked', destructive: true })) return;
    running.current = true; setBusy(true); setError(null);
    const previous = items.filter((item) => item.checked);
    const { error: e } = await supabase.from('grocery_items').delete().in('id', previous.map((item) => item.id));
    running.current = false; setBusy(false);
    if (e) { setError(`Checked items were not removed: ${e.message}`); return; }
    setRemoved(previous); setMessage('Checked items cleared.'); await load();
  }
  async function undo() {
    if (running.current || !removed.length) return;
    running.current = true; setBusy(true); setError(null);
    const { error: e } = await supabase.from('grocery_items').insert(removed);
    running.current = false; setBusy(false);
    if (e) { setError(`Could not restore items: ${e.message}`); return; }
    setRemoved([]); setMessage('Items restored.'); await load();
  }
  async function offlineAccess(enabled: boolean) {
    if (!userId || running.current) return;
    if (!enabled && pendingCount && !await confirm({ title: 'Discard pending checkmarks?', message: 'These checkmarks have not reached your account. Turning off offline access clears the saved list and pending changes from this device.', confirmLabel: 'Discard & turn off', destructive: true })) return;
    try {
      if (enabled) await persist({ version: 1, savedAt: Date.now(), items, pending: [] });
      else { await AsyncStorage.removeItem(groceryCacheKey(userId)); cache.current = null; setPendingCount(0); }
      setOffline(enabled); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update offline access.'); }
  }

  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  const row = (item: GroceryItem) => (
    <View key={item.id}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md }}>
      <Pressable disabled={busy} onPress={() => { void toggle(item); }} accessibilityLabel={`Mark ${item.name} ${item.checked ? 'unchecked' : 'checked'}`} accessibilityRole="checkbox" aria-checked={item.checked} aria-disabled={busy} accessibilityState={{ checked: item.checked }} style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name={item.checked ? 'checkbox' : 'square-outline'} size={26} color={item.checked ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={[typography.body, item.checked && { textDecorationLine: 'line-through', color: colors.textMuted }]}>
          {item.name}{item.quantity ? ` · ${item.quantity}` : ''}
        </Text>
        {item.from_recipes?.length ? <Text style={typography.small} numberOfLines={1}>For {item.from_recipes.join(', ')}</Text> : null}
      </View>
      </Pressable>
      {item.barcode ? (
        <Pressable onPress={() => router.push({ pathname: '/product/[barcode]', params: { barcode: item.barcode! } })} hitSlop={10} accessibilityLabel="View product score" style={{ marginRight: spacing.md }}>
          <Ionicons name="leaf-outline" size={20} color={colors.primary} />
        </Pressable>
      ) : null}
      <Pressable disabled={busy || pendingCount > 0} onPress={() => remove(item)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Remove ${item.name}`}>
        <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  return (
    <Screen>
      <TabHeader
        title="Groceries"
        backFallback="/(tabs)/plan"
        right={
          <Pressable onPress={() => router.push('/pantry')} hitSlop={10} accessibilityLabel="Pantry">
            <Ionicons name="file-tray-full-outline" size={24} color={colors.primary} />
          </Pressable>
        }
      />
      <Text style={typography.small}>{todo.length} item{todo.length === 1 ? '' : 's'} to pick up</Text>
      <Button title="Make list from meal plan" icon="calendar-outline" variant="secondary" onPress={() => router.push('/grocery/generate')} />
      <View style={{ height: spacing.md }} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField accessibilityLabel="Add a grocery item" placeholder="Add an item" value={name} onChangeText={setName} onSubmitEditing={add} returnKeyType="done" />
        </View>
        <View style={{ width: 80 }}><Button title="Add" onPress={add} disabled={!name.trim() || busy || !loaded} /></View>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {error || pendingCount ? <Button title="Retry sync & refresh" variant="secondary" disabled={busy} onPress={() => { void load(); }} /> : null}
      {pendingCount ? <Notice>{pendingCount} checkmark{pendingCount === 1 ? '' : 's'} pending sync. Add/remove needs a connection.</Notice> : message ? <Notice tone="info">{message}</Notice> : null}
      {removed.length ? <Button title="Undo remove groceries" variant="ghost" disabled={busy} onPress={() => { void undo(); }} /> : null}
      {!loaded ? <Loading /> : null}

      {loaded && !error && items.length === 0 ? <Empty icon="cart-outline" text="Your list is empty. Add items here or generate groceries from your plan." /> : null}
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
            <Button title="Clear" variant="ghost" disabled={busy || pendingCount > 0} onPress={clearChecked} />
          </View>
          <Card>{done.map(row)}</Card>
        </>
      ) : null}
      <Card>
        <NavigationRow title="Pantry" subtitle="Keep staples out of generated lists" icon="file-tray-full-outline" onPress={() => router.push('/pantry')} />
        <Disclosure title="Offline access on this device">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1 }}><Body>Keep my list offline</Body><Body muted>Stores groceries on this device for up to 7 days. Checkmarks queue for sync; adding and removing require a connection. Cleared on sign-out.</Body></View>
            <Switch accessibilityLabel="Keep my grocery list offline" value={offline} disabled={busy || !loaded} onValueChange={(value) => { void offlineAccess(value); }} />
          </View>
        </Disclosure>
      </Card>
    </Screen>
  );
}
