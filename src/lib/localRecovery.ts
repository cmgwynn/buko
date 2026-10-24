export interface RecoveryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface RecoveryState {
  ready: boolean;
  status: 'loading' | 'empty' | 'saving' | 'saved' | 'recovered' | 'expired' | 'error';
  savedAt: number | null;
  error: string | null;
}

export const recoveryKey = (kind: string, userId: string) => `buko:recovery:${kind}:${userId}`;
export const RECIPE_DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
export const WORKOUT_SESSION_TTL = 24 * 60 * 60 * 1000;

/** A serialized, account-scoped store. Call setAccount before exposing any editing UI. */
export function createRecoveryStore<T>(options: {
  kind: string;
  ttl: number;
  storage: RecoveryStorage;
  empty(): T;
  isEmpty(value: T): boolean;
  validate(value: unknown): value is T;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let value = options.empty();
  let userId: string | null = null;
  let initialized = false;
  let generation = 0;
  let revision = 0;
  let terminalRevision: number | null = null;
  let state: RecoveryState = { ready: false, status: 'loading', savedAt: null, error: null };
  const listeners = new Set<() => void>();
  let queue: Promise<void> = Promise.resolve();
  let hydration: Promise<void> = Promise.resolve();
  const emit = () => listeners.forEach((listener) => listener());
  const setState = (next: Partial<RecoveryState>) => { state = { ...state, ...next }; emit(); };
  const enqueue = (operation: () => Promise<void>) => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const failure = (epoch: number) => {
    if (epoch === generation) setState({ status: 'error', error: 'Device recovery could not be updated. Keep this page open and retry before leaving; unsaved work may not be recoverable.' });
  };

  async function setAccount(next: string | null, retryRead = false) {
    if (initialized && next === userId && !retryRead) return hydration;
    initialized = true;
    const previous = next === userId ? null : userId;
    userId = next;
    const epoch = ++generation;
    revision++;
    value = options.empty();
    setState({ ready: false, status: 'loading', savedAt: null, error: null });
    hydration = enqueue(async () => {
      let cleanupFailed = false;
      if (previous) {
        try { await options.storage.removeItem(recoveryKey(options.kind, previous)); }
        catch { cleanupFailed = true; }
      }
      if (epoch !== generation) return;
      try {
        const raw = next ? await options.storage.getItem(recoveryKey(options.kind, next)) : null;
        if (epoch !== generation) return;
        let recovered = false;
        let expired = false;
        let savedAt: number | null = null;
        if (raw && next) {
          let record: { version?: unknown; userId?: unknown; savedAt?: unknown; value?: unknown } = {};
          try { record = JSON.parse(raw); } catch { /* Invalid records are removed, not restored. */ }
          const valid = record && record.version === 1 && record.userId === next
            && typeof record.savedAt === 'number' && Number.isFinite(record.savedAt)
            && record.savedAt <= now() && now() - record.savedAt < options.ttl
            && options.validate(record.value) && !options.isEmpty(record.value);
          if (valid) {
            value = record.value as T;
            savedAt = record.savedAt as number;
            recovered = true;
          } else {
            expired = typeof record?.savedAt === 'number' && now() - record.savedAt >= options.ttl && record.value != null;
            await options.storage.removeItem(recoveryKey(options.kind, next));
          }
        }
        if (epoch !== generation) return;
        setState({ ready: true, status: recovered ? 'recovered' : expired ? 'expired' : 'empty', savedAt, error: null });
        if (cleanupFailed) failure(epoch);
      } catch {
        if (epoch === generation) {
          setState({ ready: false });
          failure(epoch);
        }
      }
    });
    return hydration;
  }

  function persist(terminal = false): Promise<void> {
    const owner = userId;
    const epoch = generation;
    const version = revision;
    const snapshot = value;
    const savedAt = now();
    if (!owner || !state.ready) return Promise.reject(new Error('Recovery is not ready for this account.'));
    const empty = terminal || options.isEmpty(snapshot);
    // A terminal record is durable before remote completion; a crash cannot restore finished work.
    const encoded = JSON.stringify({ version: 1, userId: owner, savedAt, value: empty ? null : snapshot });
    setState({ status: 'saving', error: null });
    return enqueue(async () => {
      try {
        await options.storage.setItem(recoveryKey(options.kind, owner), encoded);
        if (epoch === generation && version === revision) terminalRevision = empty ? version : null;
        if (epoch === generation && version === revision) {
          setState({ status: empty ? 'empty' : 'saved', savedAt: empty ? null : savedAt, error: null });
        }
      } catch (error) {
        failure(epoch);
        throw error;
      }
    });
  }

  function set(next: T) {
    if (!state.ready || !userId) throw new Error('Wait for account recovery before editing.');
    value = next;
    revision++;
    emit();
    void persist().catch(() => {});
  }

  return {
    get: () => value,
    getRecovery: () => state,
    getAccount: () => userId,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setAccount,
    set,
    retry: () => state.ready ? persist() : setAccount(userId, true),
    reportError(message: string) { setState({ status: 'error', error: message }); },
    /** Await before submitting remote completion. Resume recovery with retry() if submission fails. */
    prepareToComplete: () => persist(true),
    async clear() {
      if (!state.ready || !userId) return;
      const alreadyRetired = terminalRevision === revision;
      value = options.empty();
      revision++;
      emit();
      if (alreadyRetired) {
        terminalRevision = revision;
        setState({ status: 'empty', savedAt: null, error: null });
        return;
      }
      await persist(true);
    },
    async purge(owner: string) {
      if (owner === userId) await setAccount(null);
      await enqueue(() => options.storage.removeItem(recoveryKey(options.kind, owner)));
    },
  };
}
