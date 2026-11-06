/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Which workflows were just acted on and may not have caught up yet.
 *
 * These are Temporal operations: `terminate` returns `{success: true}` as soon as the request is
 * accepted, but the visibility store the list and detail reads come from lags behind it. Refetching
 * immediately therefore returns the *old* status, and because nothing further changes, the UI parks
 * on it: the run looks like the action silently failed.
 *
 * The engine gives no signal that a read is stale (nothing tells the client to keep polling), so the
 * client remembers instead.
 *
 * Module-level on purpose: a drawer that unmounts and remounts (or a list that re-renders) must not
 * forget that an action is still settling.
 */

/** How long a workflow just acted on may lag the visibility store. */
export const DEFAULT_SETTLE_MS = 20_000;

const settling = new Map<string, number>();

/** Marks a workflow as recently acted on, so run-scoped polls keep running for a while. */
export function markSettling(workflowId: string, ms: number = DEFAULT_SETTLE_MS): void {
  if (!workflowId) {
    return;
  }
  settling.set(workflowId, Date.now() + ms);
}

export function isSettling(workflowId: string | undefined | null): boolean {
  if (!workflowId) {
    return false;
  }
  const until = settling.get(workflowId);
  if (until === undefined) {
    return false;
  }
  if (Date.now() > until) {
    settling.delete(workflowId);
    return false;
  }
  return true;
}

/** Exposed for tests; nothing in the app needs to clear this by hand. */
export function clearSettling(): void {
  settling.clear();
}
