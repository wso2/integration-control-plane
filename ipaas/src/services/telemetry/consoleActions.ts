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
 * Console actions: what a person did in the console that no API call shows (a page view, a create flow left
 * unfinished, an error they saw), for the growth analytics in integration-engineering#4182. The console sends them in
 * batches to ipaas-service, which checks each against its taxonomy (growth/console_actions.yaml), stamps the user and
 * organization from the token and forwards them to Moesif. Feature usage that an API call does show (creating,
 * building, deploying) is reported by ipaas-service itself and is never repeated here.
 *
 * Off unless the runtime config sets CONSOLE_ANALYTICS_ENABLED. Nothing here may break or slow the console: actions
 * are buffered and sent every few seconds, every failure drops the batch, and nothing is retried.
 *
 * Only IDs, codes and counts are sent. Pages are route templates (`/organizations/:orgHandler/...`), never paths,
 * which carry the organization handle and customer-chosen names; a dimension never holds user input.
 */

import { postConsoleActions } from '../../api/telemetry';
import { getSession } from '../../auth';
import type { ConsoleActionDimensionValue, ConsoleActionPayload } from '../../types/telemetry';
import { stripBase } from '../../utils/basePath';
import { routeTemplate, type EntityScope, type RouteNode } from '../../utils/consoleRoute';

const PREFIX = 'integration-platform.console';

/** The phase 1 console actions. ipaas-service declares each in growth/console_actions.yaml and drops any other. */
export const ConsoleAction = {
  PageView: `${PREFIX}.navigation.page-view`,
  CreateOptionSelected: `${PREFIX}.intent.create-option-selected`,
  FormAbandoned: `${PREFIX}.intent.form-abandoned`,
  FirstSession: `${PREFIX}.onboarding.first-session`,
  GitAuthorization: `${PREFIX}.onboarding.git-authorization`,
  ErrorShown: `${PREFIX}.friction.error-shown`,
  EmptyState: `${PREFIX}.friction.empty-state`,
  PermissionDenied: `${PREFIX}.friction.permission-denied`,
  QuotaBlocked: `${PREFIX}.friction.quota-blocked`,
  SessionStart: `${PREFIX}.session.start`,
} as const;

export type ConsoleActionName = (typeof ConsoleAction)[keyof typeof ConsoleAction];

export type CreateOption = 'cloud-editor' | 'import-repo' | 'sample' | 'prebuilt' | 'generate-mcp';
export type CreateSurface = 'create-page' | 'empty-project';
export type AbandonedEntity = 'project' | 'integration' | 'prebuilt-integration';
export type EmptyResource = 'projects' | 'integrations' | 'environments' | 'cd-pipelines' | 'configs' | 'health-checks' | 'logs' | 'data-planes';

/** Each action's dimensions, as the taxonomy declares them: an enum here is the taxonomy's list of values. */
export interface ConsoleActionDimensions {
  [ConsoleAction.PageView]: { route: string; entity_scope?: EntityScope; referrer_route?: string };
  [ConsoleAction.CreateOptionSelected]: { option: CreateOption; surface: CreateSurface };
  [ConsoleAction.FormAbandoned]: { entity: AbandonedEntity; seconds_on_form: number; furthest_step?: string };
  [ConsoleAction.FirstSession]: { referrer: string };
  [ConsoleAction.GitAuthorization]: { outcome: 'started' | 'completed' | 'needs-install' | 'failed' | 'cancelled'; git_provider: 'github' };
  [ConsoleAction.ErrorShown]: { operation: string; status?: number; error_code?: string };
  [ConsoleAction.EmptyState]: { resource: EmptyResource; state: 'no-data' | 'no-results' };
  [ConsoleAction.PermissionDenied]: { feature: string; required_permission: string };
  [ConsoleAction.QuotaBlocked]: { limit: number; interaction: 'shown' | 'clicked'; option?: CreateOption; surface?: CreateSurface };
  [ConsoleAction.SessionStart]: { referrer: string; viewport: 'mobile' | 'tablet' | 'desktop'; browser: string };
}

/** Flush cadence. */
export const FLUSH_INTERVAL_MS = 5000;
/** ipaas-service answers 413 above this many actions. */
export const MAX_BATCH_SIZE = 50;

let buffer: ConsoleActionPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let listening = false;
let pageRoutes: RouteNode[] | undefined;
let sessionId = newSessionId();

function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // randomUUID needs a secure context; this only groups one tab's actions.
    return `s-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

export const isConsoleAnalyticsEnabled = (): boolean => window.API_CONFIG?.consoleAnalyticsEnabled === true;

/** The app's route table, so every action can name the route template it happened on. Set once, before the first render. */
export function setConsoleRoutes(routes: RouteNode[]): void {
  pageRoutes = routes;
}

// Read from the location when the action is recorded. Mount effects of a newly shown page run before any effect
// higher in the tree, so a page held in state would still name the previous page for them.
function currentPage(): string {
  return pageRoutes ? routeTemplate(pageRoutes, stripBase(window.location.pathname)) : '/';
}

/** Records one console action. Never throws and never waits: the action joins the next batch. */
export function trackConsoleAction<A extends ConsoleActionName>(action: A, dimensions: ConsoleActionDimensions[A]): void {
  if (!isConsoleAnalyticsEnabled()) return;
  try {
    buffer.push({ action, occurredAt: new Date().toISOString(), page: currentPage(), sessionId, dimensions: scalarDimensions(dimensions) });
    listenForPageHide();
    if (buffer.length >= MAX_BATCH_SIZE) {
      flushConsoleActions();
      return;
    }
    flushTimer ??= setTimeout(() => flushConsoleActions(), FLUSH_INTERVAL_MS);
  } catch {
    // A broken tracking call must not break the interaction it measures.
  }
}

// Drops undefined and non-finite values: the service drops anything that is not a string, a whole number or a boolean.
function scalarDimensions(dimensions: object): Record<string, ConsoleActionDimensionValue> {
  const out: Record<string, ConsoleActionDimensionValue> = {};
  for (const [key, value] of Object.entries(dimensions)) {
    if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value;
  }
  return out;
}

/**
 * Sends what is buffered. `keepalive` lets the request outlive the page, for the flush when the tab is hidden or
 * closed. Without a session the batch is dropped: the service would refuse it, and the actions belong to no one.
 */
export function flushConsoleActions(keepalive = false): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  if (!getSession()) return;
  for (let i = 0; i < batch.length; i += MAX_BATCH_SIZE) {
    postConsoleActions(batch.slice(i, i + MAX_BATCH_SIZE), keepalive).catch(() => {
      // Dropped: telemetry is never retried and never shown.
    });
  }
}

// Once per document. pagehide also covers a page frozen into the back/forward cache; a hidden tab may never come back.
function listenForPageHide(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('pagehide', () => flushConsoleActions(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushConsoleActions(true);
  });
}

/** @internal Resets the module state between tests. */
export function resetConsoleActionsForTest(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  buffer = [];
  pageRoutes = undefined;
  sessionId = newSessionId();
}
