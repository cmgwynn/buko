import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { toDateString } from './diary';

/** Refresh calendar-dependent values at local midnight and after a suspended app resumes. */
export function useLocalDay(): string {
  const [day, setDay] = useState(() => toDateString(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function update() {
      const now = new Date();
      setDay(toDateString(now));
      clearTimeout(timer);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(update, midnight.getTime() - now.getTime() + 100);
    }
    update();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  return day;
}
