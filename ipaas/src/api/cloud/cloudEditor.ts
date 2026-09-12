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
 * OpenChoreo has no container-registry concept — the BFF resolves the editor
 * image from its own config — so getOrCreateSampleRegistry returns a synthetic
 * registry to keep the shared editor flow (which threads a registryId through)
 * unchanged.
 */

import { BffError, bff, bffUserMessage, q } from './_client';
import { HttpError } from '../../types/http';
import type { CodeServerInstance, ContainerRegistry } from '../../types/cloudEditor';

interface CodeServerResponse {
  editorUrl?: string;
  componentName: string;
  status: 'created' | 'resumed' | 'provisioning';
}

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 90_000;

export async function getOrCreateSampleRegistry(_orgUuid: string): Promise<ContainerRegistry> {
  return { id: 'openchoreo-default', host: '', name: 'OpenChoreo Registry' };
}

// OpenChoreo does not expose the editor's cluster/release/namespace, so the
// pod-status wheel can't poll here — the page falls back to timed steps.
const asInstance = (url: string): CodeServerInstance => ({ url, clusterId: '', releaseId: '', namespace: '' });

export async function callCreateCodeServer(params: { userId: string; organizationId: string; projectId: string; componentId: string; orgHandle: string; imageUrl: string; registryId: string; sourceCommitHash?: string }): Promise<CodeServerInstance> {
  const { userId, projectId, componentId, imageUrl, sourceCommitHash } = params;

  // organizationId/orgHandle are accepted for signature parity with the wip
  // implementation but deliberately not forwarded: the BFF's CreateCodeServerInput
  // has no org fields — it resolves the org (namespace) from the bearer token's
  // claims, and the editor identity is keyed on (user, project, component) only.
  let created: CodeServerResponse;
  try {
    created = await bff.post<CodeServerResponse>('/code-server', {
      userId,
      projectId,
      componentId,
      imageUrl,
      sourceCommitHash,
    });
  } catch (err) {
    // A 4xx describes something the user can act on and the BFF words it for them
    // — a full editor quota, for instance, says to close an existing editor or
    // upgrade. Re-throw as the shared HttpError so the (product-agnostic) page can
    // show that text instead of its own generic failure message. Everything else
    // propagates untouched and keeps the generic wording.
    const message = bffUserMessage(err);
    if (message !== null && err instanceof BffError) {
      throw new HttpError(err.status, message);
    }
    throw err;
  }
  if (created.editorUrl) return asInstance(created.editorUrl);

  // First-time provisioning: poll until the editor's gateway route is live.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const current = await bff.get<CodeServerResponse>(`/code-server${q({ userId, projectId, componentId })}`);
    if (current.editorUrl) return asInstance(current.editorUrl);
  }
  throw new Error('Timed out waiting for the Cloud Editor to become ready');
}
