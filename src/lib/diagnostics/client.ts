import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { config } from '../config';
import { supabase } from '../supabase';
import type { DiagnosticCode } from './core';
let owner: string | null = null;
let consent = false;
let lastSent = 0;
export function activateDiagnostics(userId: string | null, enabled: boolean) {
  owner = userId; consent = enabled; lastSent = 0;
}
export const diagnosticKey = (userId: string) => `buko:diagnostics:${userId}`;
export async function loadDiagnosticConsent(userId: string): Promise<boolean> {
  return await AsyncStorage.getItem(diagnosticKey(userId)) === 'true';
}
export async function saveDiagnosticConsent(userId: string, value: boolean): Promise<void> {
  if (!value) activateDiagnostics(userId, false);
  await AsyncStorage.setItem(diagnosticKey(userId), String(value));
  activateDiagnostics(userId, value);
}
export async function reportDiagnostic(code: DiagnosticCode, fatal: boolean): Promise<void> {
  if (!consent || !owner || Date.now() - lastSent < 60000) return;
  const expectedOwner = owner;
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session || session.user.id !== expectedOwner || !consent || owner !== expectedOwner) return;
  lastSent = Date.now();
  const response = await fetch(`${config.supabaseUrl}/functions/v1/diagnostics`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: config.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, platform: Platform.OS, fatal }), signal: AbortSignal.timeout(7000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error('Optional diagnostics were not delivered. Check relay setup or turn reporting off in Settings.');
}
