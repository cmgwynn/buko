import { Platform } from 'react-native';
import type { AlertStatus } from './types';
import { REST_NOTIFICATION_PREFIX, restNotificationId } from './restTimer';

export const REST_CHANNEL_ID = 'workout-rest';
export const REST_SOUND_FILE = 'buko_rest_cue.wav';

type NotificationsModule = typeof import('expo-notifications');
type HapticsModule = typeof import('expo-haptics');
type AudioModule = typeof import('expo-audio');

function notifications(): NotificationsModule | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

/** Reads permission without prompting. Safe to call on mount. */
export async function getAlertStatus(): Promise<AlertStatus> {
  const N = notifications();
  if (!N) return 'unavailable';
  try {
    const current = await N.getPermissionsAsync();
    if (current.granted) return 'granted';
    return current.canAskAgain ? 'unknown' : 'denied';
  } catch {
    return 'unavailable';
  }
}

async function ensureChannel(N: NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync(REST_CHANNEL_ID, {
    name: 'Rest timer',
    description: 'Tells you when a rest between sets is over.',
    importance: N.AndroidImportance.HIGH,
    sound: REST_SOUND_FILE,
    vibrationPattern: [0, 180, 120, 180],
  });
}

/** Prompts for permission. Call only from a user gesture. */
export async function requestAlertPermission(): Promise<AlertStatus> {
  const N = notifications();
  if (!N) return 'unavailable';
  try {
    await ensureChannel(N);
    const current = await N.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const next = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return next.granted ? 'granted' : next.canAskAgain ? 'unknown' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/** Schedules (replacing) the single rest alert for a session. Purely local: no push token, no server. */
export async function scheduleRestAlert(sessionId: string, at: number): Promise<boolean> {
  const N = notifications();
  if (!N) return false;
  try {
    await ensureChannel(N);
    await N.scheduleNotificationAsync({
      identifier: restNotificationId(sessionId),
      content: { title: 'Rest is over', body: 'Ready for your next set.', sound: REST_SOUND_FILE, data: { kind: 'buko-workout-rest' } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: REST_CHANNEL_ID },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelRestAlert(sessionId: string): Promise<void> {
  const N = notifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(restNotificationId(sessionId));
  } catch {
    // Already delivered or never scheduled.
  }
}

/** Cancels rest alerts left behind by other sessions (e.g. after a crash or account switch). */
export async function cancelOrphanRestAlerts(keepSessionId: string | null): Promise<void> {
  const N = notifications();
  if (!N) return;
  try {
    const keep = keepSessionId ? restNotificationId(keepSessionId) : null;
    const pending = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      pending
        .filter((n) => n.identifier.startsWith(REST_NOTIFICATION_PREFIX) && n.identifier !== keep)
        .map((n) => N.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // ignore
  }
}

let player: ReturnType<AudioModule['createAudioPlayer']> | null = null;

/** Foreground cue: a success haptic plus Buko's bundled tone. Respects the iOS silent switch. */
export async function playRestCue(): Promise<void> {
  if (Platform.OS !== 'web') {
    try {
      const Haptics = require('expo-haptics') as HapticsModule;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics unsupported on this device.
    }
  }
  try {
    if (!player) {
      const { createAudioPlayer } = require('expo-audio') as AudioModule;
      player = createAudioPlayer(require('../../../assets/sounds/buko_rest_cue.wav'));
    }
    await player.seekTo(0);
    player.play();
  } catch {
    // Audio unavailable (e.g. browser autoplay policy); the haptic/visual timer still signals the end.
  }
}

export function releaseRestCue() {
  try {
    player?.remove();
  } catch {
    // ignore
  }
  player = null;
}
