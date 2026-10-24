type Listener = () => void;

const listeners = new Set<Listener>();

export function invalidateDateHistory(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToDateHistoryInvalidation(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
