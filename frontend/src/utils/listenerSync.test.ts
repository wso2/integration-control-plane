import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LISTENER_SYNC_TIMEOUT_MS, pollPendingListeners } from './listenerSync';

// Replays what the server returned for a BI service after "Disable" on its listener
// (wso2/product-integrator#2504): the service itself stays in sync the whole time, and the
// bound listener's state only flips once the runtime's next full heartbeat lands, ~30s later.
const HEARTBEAT_DELAY_MS = 30_000;
const queryKey = ['artifacts', 'Service', 'env-1', 'comp-1'];

function setup() {
  let listenerState = 'enabled';
  const fetchService = vi.fn(async () => [{ name: 'service_1', stateInSync: true, listeners: [{ name: 'listener_1', state: listenerState }] }]);
  const client = new QueryClient();
  // Same polling rule as useArtifacts: only while an *InSync flag is not true.
  const observer = new QueryObserver(client, {
    queryKey,
    queryFn: fetchService,
    refetchInterval: (query) => (query.state.data?.some((a) => a.stateInSync !== true) ? 1000 : false),
  });
  const unsubscribe = observer.subscribe(() => {});
  setTimeout(() => (listenerState = 'disabled'), HEARTBEAT_DELAY_MS);
  const shownState = () => observer.getCurrentResult().data?.[0].listeners[0].state;
  const refetch = () => client.invalidateQueries({ queryKey });
  return { client, fetchService, shownState, refetch, unsubscribe };
}

describe('pollPendingListeners', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('without it, the one refetch after the mutation leaves the old state on screen', async () => {
    const { fetchService, shownState, refetch, unsubscribe } = setup();
    await vi.advanceTimersByTimeAsync(0);
    refetch(); // the mutation's onSettled
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchService).toHaveBeenCalledTimes(2);
    expect(shownState()).toBe('enabled');
    unsubscribe();
  });

  it('keeps refetching while a listener is pending, so the new state shows up', async () => {
    const { shownState, refetch, unsubscribe } = setup();
    await vi.advanceTimersByTimeAsync(0);
    const stop = pollPendingListeners(['listener_1'], refetch, () => {});
    await vi.advanceTimersByTimeAsync(HEARTBEAT_DELAY_MS + 1500);
    expect(shownState()).toBe('disabled');
    stop();
    unsubscribe();
  });

  it('stops refetching once cleaned up', async () => {
    const refetch = vi.fn();
    const stop = pollPendingListeners(['listener_1'], refetch, () => {});
    await vi.advanceTimersByTimeAsync(3000);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refetch).toHaveBeenCalledTimes(3);
  });

  it('does nothing when no listener is pending', async () => {
    const refetch = vi.fn();
    const onTimeout = vi.fn();
    pollPendingListeners([], refetch, onTimeout);
    await vi.advanceTimersByTimeAsync(LISTENER_SYNC_TIMEOUT_MS + 1000);
    expect(refetch).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('gives up after the timeout if the state never changes', async () => {
    const onTimeout = vi.fn();
    pollPendingListeners(['listener_1'], () => {}, onTimeout);
    await vi.advanceTimersByTimeAsync(LISTENER_SYNC_TIMEOUT_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onTimeout).toHaveBeenCalledWith(['listener_1']);
  });
});
