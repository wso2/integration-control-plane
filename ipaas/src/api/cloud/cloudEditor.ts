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
 * Cloud Editor via the BFF: POST /code-server is an idempotent get-or-create
 * of the caller's editor instance (a hidden OpenChoreo component running the
 * editor image) and returns its URL. First-time provisioning can outlast the
 * BFF's request window, in which case the response reports "provisioning" and
 * the URL is obtained by polling GET /code-server.
 *
 * That handoff has to survive losing the POST response itself: the BFF waits
 * inline for the editor's route, and a fronting gateway whose route timeout is
 * shorter than that wait cancels the request even though the create succeeded.
 * See callCreateCodeServer — a lost response falls through to the poll loop,
 * while a real verdict (quota, auth, disabled) propagates immediately.
 *
 * OpenChoreo has no container-registry concept — the BFF resolves the editor
 * image from its own config — so getOrCreateSampleRegistry returns a synthetic
 * registry to keep the shared editor flow (which threads a registryId through)
 * unchanged.
 */

import { bff, BffError, q } from './_client';
import type { CodeServerInstance, ContainerRegistry } from '../../types/cloudEditor';
import { CLOUD_EDITOR_TIMEOUT_MESSAGE } from '../../constants/cloudEditor';

interface CodeServerResponse {
  /** Set only when the editor is serving — safe to redirect to. */
  editorUrl?: string;
  /** The same final address, published while the workload is still coming up. */
  pendingEditorUrl?: string;
  ready?: boolean;
  componentName: string;
  status: 'created' | 'resumed' | 'provisioning' | 'starting';
}

/**
 * Readiness of a BFF answer, falling back to `editorUrl` presence for a BFF that
 * predates `ready`. `??` not truthiness, so an explicit `ready: false` is honoured.
 */
const readyOf = (r: CodeServerResponse): boolean => r.ready ?? !!r.editorUrl;

/** The address, ready or not. At most one of the two is ever set. */
const urlOf = (r: CodeServerResponse): string => r.editorUrl ?? r.pendingEditorUrl ?? '';

const POLL_INTERVAL_MS = 3_000;

/**
 * Budget for learning the editor's *address* — not for it becoming usable. The
 * page waits for readiness separately, so this only bounds route programming.
 */
const URL_POLL_TIMEOUT_MS = 90_000;

/**
 * Consecutive 404s tolerated before concluding a lost create never landed. The
 * component is created before the route wait, so a 404 here is control-plane lag.
 */
const MAX_MISSING_POLLS = 5;

/**
 * Statuses that mean the *response* was lost, not that the request was refused.
 * The create is idempotent and may well have succeeded, so these fall through
 * to the poll loop rather than surfacing as an error.
 *
 * 503 is deliberately absent: the BFF uses it for "cloud editor is not
 * available in this environment" (ErrCodeServerDisabled), which is a verdict.
 */
const LOST_RESPONSE_STATUSES = new Set([408, 502, 504]);

/** fetch rejects with a TypeError when the connection itself fails or the gateway hangs up. */
const isLostResponse = (err: unknown): boolean => (err instanceof BffError ? LOST_RESPONSE_STATUSES.has(err.status) : err instanceof TypeError);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function getOrCreateSampleRegistry(_orgUuid: string): Promise<ContainerRegistry> {
  return { id: 'openchoreo-default', host: '', name: 'OpenChoreo Registry' };
}

// OpenChoreo does not expose the editor's cluster/release/namespace, so the
// pod-status wheel can't poll here — readiness comes from the BFF instead.
const asInstance = (url: string, ready: boolean): CodeServerInstance => ({ url, ready, clusterId: '', releaseId: '', namespace: '' });

/** One reading of the editor's state; null when no editor component exists yet. */
export async function getCodeServer(params: { userId: string; projectId: string; componentId: string }): Promise<CodeServerInstance | null> {
  const { userId, projectId, componentId } = params;
  try {
    const current = await bff.get<CodeServerResponse>(`/code-server${q({ userId, projectId, componentId })}`);
    const url = urlOf(current);
    return url ? asInstance(url, readyOf(current)) : null;
  } catch (err) {
    if (err instanceof BffError && err.status === 404) return null;
    throw err;
  }
}

export async function callCreateCodeServer(params: { userId: string; organizationId: string; projectId: string; componentId: string; orgHandle: string; imageUrl: string; registryId: string; sourceCommitHash?: string }): Promise<CodeServerInstance> {
  const { userId, projectId, componentId, imageUrl, sourceCommitHash } = params;

  // organizationId/orgHandle are accepted for signature parity with the wip
  // implementation but deliberately not forwarded: the BFF's CreateCodeServerInput
  // has no org fields — it resolves the org (namespace) from the bearer token's
  // claims, and the editor identity is keyed on (user, project, component) only.
  let lostCreate: unknown;
  try {
    const created = await bff.post<CodeServerResponse>('/code-server', {
      userId,
      projectId,
      componentId,
      imageUrl,
      sourceCommitHash,
    });
    // Either URL ends the wait — a pending one is the editor's real address.
    if (urlOf(created)) return asInstance(urlOf(created), readyOf(created));
  } catch (err) {
    // A quota/auth/fault verdict has to surface now — polling through it would
    // replace an actionable message with a generic timeout minutes later.
    if (!isLostResponse(err)) throw err;
    lostCreate = err;
  }

  // Provisioning, or a create whose answer never came back: poll until the
  // editor's gateway route is live.
  const deadline = Date.now() + URL_POLL_TIMEOUT_MS;
  let missing = 0;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let current: CodeServerResponse;
    try {
      current = await bff.get<CodeServerResponse>(`/code-server${q({ userId, projectId, componentId })}`);
    } catch (err) {
      // 404 means no editor component exists at all. After a lost create that
      // means the POST died before creating one, so there is nothing to wait
      // for — report the original cause instead of spending the whole budget.
      if (err instanceof BffError && err.status === 404) {
        missing += 1;
        if (missing > MAX_MISSING_POLLS) throw lostCreate ?? err;
        continue;
      }
      // A blip on one poll is not a verdict on the editor; keep waiting.
      if (!isLostResponse(err)) throw err;
      continue;
    }
    missing = 0;
    if (urlOf(current)) return asInstance(urlOf(current), readyOf(current));
  }
  throw new Error(CLOUD_EDITOR_TIMEOUT_MESSAGE, { cause: lostCreate });
}
