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
 * The Playground conversation, per engine, kept in memory for the life of the
 * page so it survives a tab switch and a trip to a passage page. Like the
 * console's other chats it starts fresh on a reload; the durable record is the
 * engine's stored queries and the list of what was asked in `contextQuestions`.
 */

import { useSyncExternalStore } from 'react';
import { PLAYGROUND_TURNS_MAX } from '../constants/contextEngine';
import type { ContextQueryMode, PlaygroundConversation, PlaygroundTurn } from '../types/contextEngine';

const EMPTY: PlaygroundConversation = { turns: [], mode: 'context' };
const conversations = new Map<string, PlaygroundConversation>();
const listeners = new Set<() => void>();

/** This page's conversation with one engine; the empty conversation until a question is asked. */
export function getPlaygroundConversation(engineId: string): PlaygroundConversation {
  return conversations.get(engineId) ?? EMPTY;
}

function write(engineId: string, next: PlaygroundConversation): void {
  conversations.set(engineId, { turns: next.turns.slice(-PLAYGROUND_TURNS_MAX), mode: next.mode });
  listeners.forEach((l) => l());
}

/** Add an answered question to the end of the conversation; past the cap the oldest turn goes. */
export function appendTurn(engineId: string, turn: PlaygroundTurn): void {
  const current = getPlaygroundConversation(engineId);
  write(engineId, { turns: [...current.turns, turn], mode: current.mode });
}

/** A reopened question replaces the conversation; follow-ups then build on it. */
export function replaceTurns(engineId: string, turns: PlaygroundTurn[], mode: ContextQueryMode): void {
  write(engineId, { turns, mode });
}

export function setPlaygroundMode(engineId: string, mode: ContextQueryMode): void {
  write(engineId, { turns: getPlaygroundConversation(engineId).turns, mode });
}

/** Empty the conversation; the chosen mode stays. */
export function clearTurns(engineId: string): void {
  write(engineId, { turns: [], mode: getPlaygroundConversation(engineId).mode });
}

/** This page's conversation with one engine, live. */
export function usePlaygroundConversation(engineId: string): PlaygroundConversation {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => getPlaygroundConversation(engineId),
    () => EMPTY,
  );
}
