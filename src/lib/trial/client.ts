import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { toDateString } from '../diary';
import { supabase } from '../supabase';
import { feedbackProblem, isMissingTable, shouldRecordUse, type FeedbackCategory } from './core';

const platform = () => (Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web');
export const usageOptOutKey = (userId: string) => `buko:usage-optout:${userId}`;
const usageDayKey = (userId: string) => `buko:usage-day:${userId}`;

export async function loadUsageOptOut(userId: string): Promise<boolean> {
  return await AsyncStorage.getItem(usageOptOutKey(userId)) === 'true';
}
export async function saveUsageOptOut(userId: string, optedOut: boolean): Promise<void> {
  await AsyncStorage.setItem(usageOptOutKey(userId), String(optedOut));
}

/** Adds one to today's anonymous active-user count. Failures are silent: counting must never block the app. */
export async function recordDailyUse(userId: string): Promise<void> {
  try {
    const today = toDateString(new Date());
    const [lastDay, optedOut] = await Promise.all([AsyncStorage.getItem(usageDayKey(userId)), loadUsageOptOut(userId)]);
    if (!shouldRecordUse(lastDay, today, optedOut)) return;
    await AsyncStorage.setItem(usageDayKey(userId), today);
    const { error } = await supabase.rpc('record_daily_use', { p_platform: platform() });
    if (error && !isMissingTable(error)) await AsyncStorage.removeItem(usageDayKey(userId));
  } catch { /* best effort */ }
}

export class FeedbackUnavailableError extends Error {}

export async function sendFeedback(userId: string, category: FeedbackCategory, message: string, screen?: string): Promise<void> {
  const problem = feedbackProblem(message);
  if (problem) throw new Error(problem);
  const { error } = await supabase.from('feedback').insert({
    user_id: userId, category, message: message.trim(), screen: screen?.slice(0, 80) || null,
    platform: platform(), app_version: Constants.expoConfig?.version ?? null,
  });
  if (isMissingTable(error)) throw new FeedbackUnavailableError('In-app feedback is not switched on yet.');
  if (error) throw new Error(error.message.includes('limit') ? error.message : 'Could not send feedback. Check your connection and retry.');
}
