import { AppState, type AppStateStatus } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { assertDateString, formatLocalDate } from '../lib/dates';
import { useAuth } from './AuthProvider';

interface SelectedDateContextValue {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  today: string;
  goToday: () => void;
}

const SelectedDateContext = createContext<SelectedDateContextValue | null>(null);

export function SelectedDateProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const accountId = session?.user.id ?? null;
  const [today, setToday] = useState(() => formatLocalDate());
  const [selectedDate, setSelected] = useState(() => formatLocalDate());
  const followingToday = useRef(true);
  const priorAccount = useRef(accountId);

  useEffect(() => {
    if (priorAccount.current === accountId) return;
    priorAccount.current = accountId;
    const currentDay = formatLocalDate();
    followingToday.current = true;
    setToday(currentDay);
    setSelected(currentDay);
  }, [accountId]);

  const refreshToday = useCallback(() => {
    const currentDay = formatLocalDate();
    setToday(currentDay);
    if (followingToday.current) setSelected(currentDay);
  }, []);

  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 100);
    const timer = setTimeout(refreshToday, Math.max(1, midnight.getTime() - now.getTime()));
    return () => clearTimeout(timer);
  }, [today, refreshToday]);

  useEffect(() => {
    const onStateChange = (state: AppStateStatus) => {
      if (state === 'active') refreshToday();
    };
    const subscription = AppState.addEventListener('change', onStateChange);
    return () => subscription.remove();
  }, [refreshToday]);

  const setSelectedDate = useCallback((date: string) => {
    const validDate = assertDateString(date);
    followingToday.current = false;
    setSelected(validDate);
  }, []);

  const goToday = useCallback(() => {
    const currentDay = formatLocalDate();
    followingToday.current = true;
    setToday(currentDay);
    setSelected(currentDay);
  }, []);

  const value = useMemo(
    () => ({ selectedDate, setSelectedDate, today, goToday }),
    [selectedDate, setSelectedDate, today, goToday],
  );
  return <SelectedDateContext.Provider value={value}>{children}</SelectedDateContext.Provider>;
}

/** For components that also render outside the provider (e.g. standalone date fields). */
export function useOptionalSelectedDate(): SelectedDateContextValue | null {
  return useContext(SelectedDateContext);
}

export function useSelectedDate(): SelectedDateContextValue {
  const context = useContext(SelectedDateContext);
  if (!context) throw new Error('useSelectedDate must be used within SelectedDateProvider.');
  return context;
}
