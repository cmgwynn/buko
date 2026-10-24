import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { ActivityRecord } from './restTimer';
import type { WorkoutActivityProps } from './types';

export interface ActivityHandle {
  id: string;
  update(props: WorkoutActivityProps, staleDate?: Date): Promise<void>;
  end(policy: 'immediate' | 'default', props?: WorkoutActivityProps): Promise<void>;
}

export interface LiveActivityPort {
  start(props: WorkoutActivityProps, url?: string, staleDate?: Date): ActivityHandle;
  instances(): ActivityHandle[];
}

export type LiveActivitySupport = { available: true; port: LiveActivityPort } | { available: false; reason: string };

interface NativeActivity {
  getId(): string;
  update(props: WorkoutActivityProps, staleDate?: Date): Promise<void>;
  end(policy?: 'immediate' | 'default', props?: WorkoutActivityProps, contentDate?: Date): Promise<void>;
}
interface NativeFactory {
  start(props: WorkoutActivityProps, url?: string, staleDate?: Date): NativeActivity;
  getInstances(): NativeActivity[];
}

function wrap(native: NativeActivity): ActivityHandle {
  return {
    id: native.getId(),
    update: (props, staleDate) => native.update(props, staleDate),
    end: (policy, props) => native.end(policy, props, new Date()),
  };
}

export function portFromFactory(factory: NativeFactory): LiveActivityPort {
  return {
    start: (props, url, staleDate) => wrap(factory.start(props, url, staleDate)),
    instances: () => factory.getInstances().map(wrap),
  };
}

let cached: LiveActivitySupport | null = null;

/** Never throws: Expo Go, web, Android and binaries built without the widget extension report a reason instead. */
export function getLiveActivitySupport(): LiveActivitySupport {
  if (cached) return cached;
  cached = detect();
  return cached;
}

export function resetLiveActivitySupportForTests() {
  cached = null;
}

function detect(): LiveActivitySupport {
  if (Platform.OS !== 'ios') return { available: false, reason: 'Live Activities are only available on iPhone.' };
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { available: false, reason: 'Expo Go does not include Live Activities. Use a Buko development or store build.' };
  }
  const major = parseFloat(String(Platform.Version));
  if (Number.isFinite(major) && major < 16.4) return { available: false, reason: 'Live Activities in Buko need iOS 16.4 or later.' };
  try {
    const { workoutLiveActivity } = require('./liveActivityWidget') as { workoutLiveActivity: NativeFactory | null };
    if (!workoutLiveActivity) return { available: false, reason: 'This build does not include the Live Activity extension.' };
    return { available: true, port: portFromFactory(workoutLiveActivity) };
  } catch {
    return { available: false, reason: 'This build does not include the Live Activity extension. Rebuild the development build.' };
  }
}

const RECORD_KEY = 'buko.workoutNative.activity.v1';

export async function readActivityRecord(): Promise<ActivityRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(RECORD_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ActivityRecord>) : null;
    return parsed && typeof parsed.activityId === 'string' && typeof parsed.sessionId === 'string'
      ? { activityId: parsed.activityId, sessionId: parsed.sessionId }
      : null;
  } catch {
    return null;
  }
}

export async function writeActivityRecord(record: ActivityRecord | null): Promise<void> {
  try {
    if (record) await AsyncStorage.setItem(RECORD_KEY, JSON.stringify(record));
    else await AsyncStorage.removeItem(RECORD_KEY);
  } catch {
    // Best effort: unmatched activities are ended on the next launch anyway.
  }
}
