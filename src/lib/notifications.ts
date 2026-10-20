import * as Notifications from 'expo-notifications';

let configured = false;

/** Show timer alerts even while the app is open. Local only: no push tokens, no server involved. */
export function configureNotifications() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Schedule a local notification `seconds` from now; returns its id, or null if scheduling is not possible. */
export async function scheduleTimerNotification(title: string, body: string, seconds: number): Promise<string | null> {
  try {
    if (!(await ensureNotificationPermission())) return null;
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(seconds)), repeats: false },
    });
  } catch {
    return null;
  }
}

export async function cancelNotification(id: string | null) {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already fired or cancelled
  }
}
