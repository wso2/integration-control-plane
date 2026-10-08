// A listener enable/disable reaches the console only after the runtime applies the command and
// sends its next heartbeat, which can take tens of seconds.
export const LISTENER_POLL_INTERVAL_MS = 1000;
export const LISTENER_SYNC_TIMEOUT_MS = 120_000;

// Refetch every second while listener toggles are in flight, and give up after a while so a
// runtime that never applies the command can't leave the busy state on forever. Returns the
// cleanup, so it can be returned straight from a useEffect.
export function pollPendingListeners(pending: string[], refetch: () => void, onTimeout: (pending: string[]) => void): () => void {
  if (pending.length === 0) return () => {};
  const poll = setInterval(refetch, LISTENER_POLL_INTERVAL_MS);
  const timeout = setTimeout(() => onTimeout(pending), LISTENER_SYNC_TIMEOUT_MS);
  return () => {
    clearInterval(poll);
    clearTimeout(timeout);
  };
}
