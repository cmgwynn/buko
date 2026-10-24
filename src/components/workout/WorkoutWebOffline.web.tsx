import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Notice } from '../ui';

export function WorkoutWebOffline() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (__DEV__) return;
    let active = true;
    let readyTimeout: ReturnType<typeof setTimeout> | undefined;
    if (!('serviceWorker' in navigator)) {
      setError('This browser cannot cache the workout screen for offline reopening. Keep this tab open while offline.');
      return;
    }
    const script = Array.from(document.scripts).find((item) => item.src.includes('/_expo/static/js/web/entry-'));
    const base = script ? new URL(script.src.split('_expo/')[0]) : new URL('./', location.href);
    navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname }).then(async () => {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => {
          readyTimeout = setTimeout(() => reject(new Error('Offline screen installation timed out.')), 30000);
        }),
      ]).finally(() => { clearTimeout(readyTimeout); });
      if (active) setError(null);
    }).catch(() => { if (active) setError('Offline screen caching could not finish. Reconnect and reopen Buko before relying on offline reopening. Your local workout saves are separate.'); });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') navigator.serviceWorker.getRegistration(base.href).then((registration) => registration?.update()).catch(() => {
        if (active) setError('The offline app shell could not be checked for updates. Reconnect and reopen Buko when convenient.');
      });
    });
    return () => { active = false; clearTimeout(readyTimeout); subscription.remove(); };
  }, []);
  return error ? <Notice tone="danger">{error}</Notice> : null;
}
