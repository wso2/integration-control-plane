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
 * Questions asked from this browser, per engine, so the Playground can list and
 * reopen them. The engine stores every query for its asker, but has no route
 * that lists them yet, and a reopened query carries neither its question nor its
 * time, so both are kept here. Only the query id is needed to reopen.
 */

import { useSyncExternalStore } from 'react';
import { ASKED_QUESTIONS_MAX, CONTEXT_ENGINE_QUESTIONS_KEY_PREFIX } from '../constants/contextEngine';
import type { AskedQuestion } from '../types/contextEngine';

const EMPTY: AskedQuestion[] = [];
const cache = new Map<string, AskedQuestion[]>();
const listeners = new Set<() => void>();
const key = (engineId: string): string => `${CONTEXT_ENGINE_QUESTIONS_KEY_PREFIX}${engineId}`;

function read(engineId: string): AskedQuestion[] {
  const cached = cache.get(engineId);
  if (cached) return cached;
  let list: AskedQuestion[] = EMPTY;
  try {
    const raw = localStorage.getItem(key(engineId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    list = Array.isArray(parsed) ? parsed.filter((q): q is AskedQuestion => typeof q?.queryId === 'string' && typeof q?.question === 'string') : EMPTY;
  } catch {
    list = EMPTY;
  }
  cache.set(engineId, list);
  return list;
}

function write(engineId: string, list: AskedQuestion[]): void {
  cache.set(engineId, list);
  try {
    localStorage.setItem(key(engineId), JSON.stringify(list));
  } catch {
    // Storage may be unavailable; the list then lasts for this page only.
  }
  listeners.forEach((l) => l());
}

/** Keep a question, newest first; asking it again replaces the older entry. */
export function rememberQuestion(question: AskedQuestion): void {
  write(question.engineId, [question, ...read(question.engineId).filter((q) => q.queryId !== question.queryId)].slice(0, ASKED_QUESTIONS_MAX));
}

/** Update what a stored question now shows, e.g. after a reopen withheld its answer. */
export function updateQuestion(engineId: string, queryId: string, patch: Partial<AskedQuestion>): void {
  write(
    engineId,
    read(engineId).map((q) => (q.queryId === queryId ? { ...q, ...patch } : q)),
  );
}

/** Drop a question the engine no longer has, or will not reopen for this caller. */
export function forgetQuestion(engineId: string, queryId: string): void {
  write(
    engineId,
    read(engineId).filter((q) => q.queryId !== queryId),
  );
}

/** The questions asked from this browser on one engine, newest first. */
export function useAskedQuestions(engineId: string): AskedQuestion[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(engineId),
    () => EMPTY,
  );
}
