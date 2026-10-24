import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { billingRequest } from '../lib/billing/client';
import type { BillingStatus } from '../lib/billing/core';
import { resetStoreIdentity } from '../lib/billing/store';
import { config } from '../lib/config';
import { useAuth } from './AuthProvider';
type Value = { allowed: boolean; loading: boolean; status: BillingStatus; error: string | null; refresh: (verify?: boolean) => Promise<void> };
const initial: BillingStatus = { enforced: config.premiumEnforcement, premium: false, expiresAt: null, sandbox: false };
const Context = createContext<Value>({ allowed: !initial.enforced, loading: true, status: initial, error: null, refresh: async () => {} });
export function BillingProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const account = useRef(userId);
  account.current = userId;
  const [status, setStatus] = useState<BillingStatus>(initial);
  const [statusOwner, setStatusOwner] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async (verify = false) => {
    if (!userId) return;
    setLoading(true); setError(null);
    try {
      let result = await billingRequest(verify ? 'refresh' : 'status');
      if (account.current === userId) { setStatus({ ...result, premium: false }); setStatusOwner(userId); }
      if (!verify && result.enforced) result = await billingRequest('refresh');
      if (account.current === userId) { setStatus(result); setStatusOwner(userId); }
    } catch (err) {
      if (account.current === userId) {
        setStatus((old) => ({ ...old, premium: false }));
        setError(err instanceof Error ? err.message : 'Could not verify subscription.');
      }
    } finally { if (account.current === userId) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    setStatus(initial); setError(null);
    setStatusOwner(undefined);
    if (userId) void refresh();
    else {
      setLoading(false);
      void resetStoreIdentity().catch(() => setError('Store identity could not be cleared. Restart before switching accounts.'));
    }
    const app = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 10 * 60_000);
    return () => { app.remove(); clearInterval(timer); };
  }, [userId, refresh]);
  useEffect(() => {
    if (!status.premium || !status.expiresAt) return;
    const delay = Math.max(0, Math.min(Date.parse(status.expiresAt) - Date.now(), 2147483647));
    const timer = setTimeout(() => {
      if (status.expiresAt && Date.parse(status.expiresAt) <= Date.now()) setStatus((old) => ({ ...old, premium: false }));
    }, delay);
    return () => clearTimeout(timer);
  }, [status.premium, status.expiresAt]);
  const current = statusOwner === userId ? status : initial;
  const value = useMemo(() => ({ status: current, loading, error, refresh, allowed: !current.enforced || current.premium }), [current, loading, error, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useBilling = () => useContext(Context);
