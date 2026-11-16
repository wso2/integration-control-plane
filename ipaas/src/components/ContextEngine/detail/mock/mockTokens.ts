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
 * MOCK. Access tokens for the API Mock and MCP Mock tabs, kept in memory for this page only.
 * They are not issued by any service and the engine does not accept them; they exist so the
 * team can try the proposed token flow before a real one is designed.
 */

import { useSyncExternalStore } from 'react';

export interface MockToken {
  id: string;
  name: string;
  createdAt: number;
  status: 'active' | 'revoked';
  /** The plaintext, shown once after create or regenerate; dropped when the drawer closes. */
  secret?: string;
}

const EMPTY: MockToken[] = [];
const store = new Map<string, MockToken[]>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const set = (engineId: string, list: MockToken[]) => {
  store.set(engineId, list);
  emit();
};

/** A random value shaped like a token, plainly marked as a mock. */
function mockSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return `ce_mock_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function useMockTokens(engineId: string): MockToken[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => store.get(engineId) ?? EMPTY,
  );
}

export function createMockToken(engineId: string, name: string): MockToken {
  const token: MockToken = { id: crypto.randomUUID(), name: name.trim(), createdAt: Date.now(), status: 'active', secret: mockSecret() };
  set(engineId, [token, ...(store.get(engineId) ?? [])]);
  return token;
}

export function regenerateMockToken(engineId: string, id: string): MockToken | undefined {
  let next: MockToken | undefined;
  set(
    engineId,
    (store.get(engineId) ?? []).map((t) => (t.id === id ? (next = { ...t, status: 'active', secret: mockSecret() }) : t)),
  );
  return next;
}

export function revokeMockToken(engineId: string, id: string): void {
  set(
    engineId,
    (store.get(engineId) ?? []).map((t) => (t.id === id ? { ...t, status: 'revoked', secret: undefined } : t)),
  );
}

export function deleteMockToken(engineId: string, id: string): void {
  set(
    engineId,
    (store.get(engineId) ?? []).filter((t) => t.id !== id),
  );
}

/** Forget a token's plaintext once its drawer closes, as a real service would. */
export function forgetMockSecret(engineId: string, id: string): void {
  set(
    engineId,
    (store.get(engineId) ?? []).map((t) => (t.id === id ? { ...t, secret: undefined } : t)),
  );
}
