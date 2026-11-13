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
 * Hooks that report console actions (see services/telemetry/consoleActions.ts). The app-wide ones are mounted once:
 * page views in App, the session and mutation reporting in AppLayout.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../auth';
import { entryReferrer } from '../services/telemetry/entryReferrer';
import { ConsoleAction, flushConsoleActions, trackConsoleAction, type AbandonedEntity, type ConsoleActionDimensions, type ConsoleActionName } from '../services/telemetry/consoleActions';
import { httpCodeOf, httpStatusOf, isPermissionError, refusedRoute, refusedScope } from '../utils/apiErrors';
import { entityScopeOf, routeTemplate, type RouteNode } from '../utils/consoleRoute';
import { local } from '../utils/storage';
import type { FunnelOperation } from '../types/telemetry';

/** Reports a page view on every navigation, as the route template the path renders. Mount once, in App. */
export function usePageViewTracking(routes: RouteNode[]): void {
  const { pathname } = useLocation();
  const previous = useRef<string | undefined>(undefined);
  const reportedPath = useRef<string | undefined>(undefined);
  useEffect(() => {
    // StrictMode runs a mount effect twice; one location is one page view.
    if (reportedPath.current === pathname) return;
    reportedPath.current = pathname;
    const route = routeTemplate(routes, pathname);
    trackConsoleAction(ConsoleAction.PageView, { route, entity_scope: entityScopeOf(route), referrer_route: previous.current });
    previous.current = route;
  }, [routes, pathname]);
}

const SEEN_KEY_PREFIX = 'console_seen:';

/** Whether this is the user's first console session in this browser, remembering that it no longer is. */
function isFirstSession(userId: string): boolean {
  try {
    const key = SEEN_KEY_PREFIX + userId;
    if (local.get(key) !== null) return false;
    local.set(key, '1');
    return true;
  } catch {
    // Blocked storage: a first session on every load would be worse data than none.
    return false;
  }
}

function viewport(): 'mobile' | 'tablet' | 'desktop' {
  if (window.innerWidth < 600) return 'mobile';
  return window.innerWidth < 1024 ? 'tablet' : 'desktop';
}

function browserFamily(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

// Module-level, so a remounted shell does not start a second session in the same tab.
let sessionStarted = false;

/** @internal Lets a test start a new tab session. */
export function resetSessionForTest(): void {
  sessionStarted = false;
}

/** Reports the session's start, and the user's first session, once per tab. Mount once, in the signed-in shell. */
export function useSessionAnalytics(): void {
  const { userId } = useAuth();
  useEffect(() => {
    if (sessionStarted || !userId) return;
    sessionStarted = true;
    const referrer = entryReferrer();
    trackConsoleAction(ConsoleAction.SessionStart, { referrer, viewport: viewport(), browser: browserFamily() });
    if (isFirstSession(userId)) trackConsoleAction(ConsoleAction.FirstSession, { referrer });
  }, [userId]);
}

/**
 * Reports failed mutations: a refusal for a missing scope as permission-denied, and a failed activation-funnel
 * mutation (one whose `meta.operation` is set) as error-shown, since its page shows the error. Mount once, in the
 * signed-in shell.
 */
export function useMutationErrorTracking(): void {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return;
        const { error } = event.mutation.state;
        const operation = event.mutation.meta?.operation;
        if (isPermissionError(error)) {
          // The funnel operation when the mutation names one, else the refused route's pattern, which ipaas-service sends.
          trackConsoleAction(ConsoleAction.PermissionDenied, { feature: operation ?? refusedRoute(error) ?? 'unspecified', required_permission: refusedScope(error) ?? 'unknown' });
          return;
        }
        if (!operation) return;
        const status = httpStatusOf(error);
        trackConsoleAction(ConsoleAction.ErrorShown, { operation, status: Number.isNaN(status) ? undefined : status, error_code: httpCodeOf(error) || undefined });
      }),
    [queryClient],
  );
}

/**
 * Reports a create flow left without creating anything: the page unmounts, or the tab closes, before a mutation for
 * `operation` succeeds. Pages need no submit hook: any successful `operation` mutation while the page is open
 * completes the form.
 */
export function useFormAbandonment(entity: AbandonedEntity, operation: FunnelOperation): void {
  const queryClient = useQueryClient();
  const visit = useRef<{ openedAt: number; done: boolean } | undefined>(undefined);
  const pendingLeave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    // An unmount counts only once the effect has not run again in the same task. StrictMode unmounts and remounts a
    // page at once, and that is the same visit, not one abandoned at 0 seconds and another started.
    const resumed = pendingLeave.current !== undefined ? visit.current : undefined;
    clearTimeout(pendingLeave.current);
    pendingLeave.current = undefined;
    const current = resumed ?? { openedAt: Date.now(), done: false };
    visit.current = current;
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success' && event.mutation.meta?.operation === operation) current.done = true;
    });
    const report = () => {
      if (current.done) return;
      current.done = true;
      trackConsoleAction(ConsoleAction.FormAbandoned, { entity, seconds_on_form: Math.round((Date.now() - current.openedAt) / 1000) });
    };
    // The page is going away, so the next timed flush never comes: send it now.
    const reportOnPageHide = () => {
      report();
      flushConsoleActions(true);
    };
    window.addEventListener('pagehide', reportOnPageHide);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', reportOnPageHide);
      pendingLeave.current = setTimeout(() => {
        pendingLeave.current = undefined;
        report();
      }, 0);
    };
  }, [queryClient, entity, operation]);
}

/**
 * Reports `action` each time `when` turns true, such as an empty state or a blocked control being shown. The
 * dimensions are read when it fires, so a new object on every render does not report again.
 */
export function useConsoleActionWhen<A extends ConsoleActionName>(when: boolean, action: A, dimensions: ConsoleActionDimensions[A]): void {
  const latest = useRef(dimensions);
  latest.current = dimensions;
  // The action reported for the current stretch of `when`: StrictMode runs a mount effect twice, and that is still
  // one showing.
  const reported = useRef<A | undefined>(undefined);
  useEffect(() => {
    if (!when) {
      reported.current = undefined;
      return;
    }
    if (reported.current === action) return;
    reported.current = action;
    trackConsoleAction(action, latest.current);
  }, [when, action]);
}
