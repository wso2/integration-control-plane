import type { UseQueryResult } from '@tanstack/react-query';

// ── MI management: an answer the runtime may not have given yet ──
//
// Every MI field carries `preparing`. Where the ICP dials the runtime's management port —
// the default — the answer is in the first response and `preparing` is never true, so these
// hooks behave exactly as they always did. Where the ICP reaches the runtime over its
// heartbeat instead, the first call reports `preparing` and the hook polls until the answer
// lands. No component learns which of the two served it; the ones we want to annotate read
// `preparing`, and the rest keep their spinner.

export interface Fetchable {
  preparing: boolean;
  // There is an answer, but a write has superseded it and its replacement is on the way.
  // Without this the table went on showing the level you had just changed away from, until
  // the page was reloaded.
  stale: boolean;
  retryAfterMs: number;
}

// Selected by every MI query, so a hook can tell "not yet" and "not any more" apart from
// "nothing".
export const FETCHABLE = 'preparing, stale, retryAfterMs';

// Used only when the server names no interval of its own.
const FETCHABLE_POLL_MS = 750;

// How long a write is followed before the caller gives up on it.
//
// Longer than the server's own deadline for a queued write (120 s), deliberately: the
// server knows whether the runtime ever took the work and says so precisely, and a client
// that quit first replaced that answer with a guess. This is the backstop for a server
// that stops answering at all, not the normal way a write ends.
const SETTLE_DEADLINE_MS = 130_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// react-query's refetchInterval: poll while the server has no answer, and while the answer
// it gave is being replaced. The server names the cadence for each — a stale answer polls
// more slowly, because something true is already on screen.
//
// A failure ends the poll. The last *successful* response is what `state.data` holds, so a
// read that reported "preparing" and then failed would otherwise keep asking for ever
// behind an error no screen ever showed — which is what a runtime without a user store did:
// one refusal per second, and a blank panel.
export const untilReady = (query: { state: { data?: Partial<Fetchable>; status: string } }): number | false => {
  if (query.state.status === 'error') return false;
  const answer = query.state.data;
  return answer?.preparing || answer?.stale ? answer.retryAfterMs || FETCHABLE_POLL_MS : false;
};

// Splits a fetchable answer into its value and the flags, leaving the query result
// otherwise intact.
//
// `isLoading` covers `preparing`, because a hook's contract is "no data yet" and a screen
// that only watches it must keep its spinner rather than render empty. It deliberately does
// not cover `stale`: there is real data to show, and replacing it with a spinner after
// every write would be worse than showing it a moment out of date.
export function unwrap<F extends Partial<Fetchable>, T>(query: UseQueryResult<F>, pick: (answer: F) => T) {
  // Not preparing once it has failed: the wait is over, and a screen that keeps its spinner
  // on `isLoading` would hide the error instead of reporting it.
  const preparing = query.data?.preparing === true && !query.isError;
  return {
    ...query,
    data: query.data && !preparing ? pick(query.data) : undefined,
    isLoading: query.isLoading || preparing,
    preparing,
    stale: query.data?.stale === true,
  };
}

// crypto.randomUUID needs a secure context — HTTPS, or localhost. A console served over
// plain HTTP elsewhere would throw here and fail every write before it was sent.
const newRequestId = (): string => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `mi-${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Asks again until the runtime has answered — for the calls made outside a hook, where
// react-query's polling is not available.
//
// A write the ICP cannot answer inside the request is queued for the runtime's next
// heartbeat, and asking again is what polls it: the requestId is what makes the second ask
// the same write rather than a second one. A read ignores it.
export async function settle<T extends Partial<Fetchable>>(ask: (requestId: string) => Promise<T>): Promise<T> {
  const requestId = newRequestId();
  const deadline = Date.now() + SETTLE_DEADLINE_MS;
  for (;;) {
    const answer = await ask(requestId);
    if (!answer.preparing) return answer;
    if (Date.now() > deadline) {
      throw new Error('The runtime has not confirmed this change. Check its state before retrying.');
    }
    await sleep(answer.retryAfterMs || FETCHABLE_POLL_MS);
  }
}
