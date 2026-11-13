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
 * File Upload sources a new engine was created with. The BFF adds an engine's connector sources
 * itself, but a File Upload source is the engine's own, and its files exist only in this tab. They
 * wait here, at module level, so leaving the wizard keeps them: once the engine runs, each source is
 * registered and its files go to the upload store in `contextUploads`. Until then, closing the tab
 * loses them, so the browser asks first.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { addContextSource, getContextEngine } from '../api/contextEngine';
import { ENGINE_STATUS_POLL_MS, STAGED_SOURCE_WAIT_MS } from '../constants/contextEngine';
import { engineMessage } from '../utils/contextEngine';
import { HttpError } from '../types/http';
import { rememberSourceRules, startUploads, type FileToUpload } from './contextUploads';
import type { ContextSourceConfig, FileVisibility } from '../types/contextEngine';

export interface StagedEngineSource {
  source: ContextSourceConfig;
  files: FileToUpload[];
  visibility: FileVisibility;
  /** The files' audience tags (see `visibilityTags`). */
  audience: string[];
}

export interface StagedSourcesState {
  /** Sources still waiting for the engine to run. */
  waiting: number;
  /** Why a source was not added. */
  failures: string[];
}

const IDLE: StagedSourcesState = { waiting: 0, failures: [] };
const states = new Map<string, StagedSourcesState>();
const holding = new Map<string, StagedEngineSource[]>();
const listeners = new Set<() => void>();

function set(engineId: string, next: StagedSourcesState): void {
  states.set(engineId, next);
  syncLeaveGuard();
  listeners.forEach((l) => l());
}

function askBeforeLeaving(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = true;
}
let guardingLeave = false;

function syncLeaveGuard(): void {
  const files = [...holding.values()].some((list) => list.some((s) => s.files.length > 0));
  if (files === guardingLeave) return;
  guardingLeave = files;
  if (files) window.addEventListener('beforeunload', askBeforeLeaving);
  else window.removeEventListener('beforeunload', askBeforeLeaving);
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Polls the engine until it runs. False when it failed, is gone, or did not start in time. */
async function engineRuns(engineId: string): Promise<boolean> {
  const deadline = Date.now() + STAGED_SOURCE_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const engine = await getContextEngine(engineId);
      if (engine.state === 'ready') return true;
      if (engine.state === 'failed' || engine.state === 'deleting') return false;
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return false;
    }
    await wait(ENGINE_STATUS_POLL_MS);
  }
  return false;
}

/** Hold the sources until the engine runs, then register them and send their files. */
export function stageEngineSources(engineId: string, sources: StagedEngineSource[]): void {
  if (sources.length === 0) return;
  holding.set(engineId, sources);
  set(engineId, { waiting: sources.length, failures: [] });
  void (async () => {
    const failures: string[] = [];
    if (!(await engineRuns(engineId))) {
      failures.push(...sources.map(({ source }) => `“${source.name.trim()}” wasn't added: the engine didn't start in time. Add it again from this page.`));
    } else {
      for (const { source, files, visibility, audience } of sources) {
        try {
          const created = await addContextSource(engineId, source);
          rememberSourceRules(created.id, source.audience ?? []);
          if (files.length > 0) startUploads(engineId, created.id, files, visibility, audience);
        } catch (err) {
          failures.push(`“${source.name.trim()}” wasn't added: ${engineMessage(err, 'the engine refused it')}`);
        }
      }
    }
    holding.delete(engineId);
    set(engineId, { waiting: 0, failures });
  })();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Where this tab stands with the File Upload sources a new engine was created with. */
export function useStagedEngineSources(engineId: string): StagedSourcesState {
  const getSnapshot = useCallback(() => states.get(engineId) ?? IDLE, [engineId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE);
}
