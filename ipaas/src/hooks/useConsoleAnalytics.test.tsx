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

import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { StrictMode, act, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BffError } from '../api/_client';
import type { FunnelOperation } from '../types/telemetry';

const track = vi.hoisted(() => vi.fn());
const flush = vi.hoisted(() => vi.fn());
vi.mock('../services/telemetry/consoleActions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  trackConsoleAction: track,
  flushConsoleActions: flush,
}));
const auth = vi.hoisted(() => ({ userId: 'user-1' }));
vi.mock('../auth', () => ({ useAuth: () => auth }));

import { ConsoleAction, setConsoleRoutes } from '../services/telemetry/consoleActions';
import { resetSessionForTest, useConsoleActionWhen, useFormAbandonment, useMutationErrorTracking, usePageViewTracking, useSessionAnalytics } from './useConsoleAnalytics';

let unmount: () => Promise<void> = async () => {};
let client: QueryClient;

async function render(ui: ReactNode, path = '/', { strict = false } = {}): Promise<void> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
  await act(async () => root.render(strict ? <StrictMode>{tree}</StrictMode> : tree));
  // An unmount is reported a task later (see useFormAbandonment), so wait for that task too.
  unmount = async () => {
    act(() => root.unmount());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    unmount = async () => {};
  };
}

const calls = (action: string) => track.mock.calls.filter(([name]) => name === action).map(([, dims]) => dims);

beforeEach(() => {
  (window as unknown as { API_CONFIG: object }).API_CONFIG = { consoleAnalyticsEnabled: true };
  track.mockClear();
  flush.mockClear();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  window.localStorage.clear();
});
afterEach(() => unmount());

describe('usePageViewTracking', () => {
  const routes = [{ children: [{ path: 'organizations/:orgHandler/projects/:projectHandler/home' }, { path: 'organizations/:orgHandler' }] }];
  let go: (path: string) => void = () => {};
  function Pages() {
    usePageViewTracking(routes);
    const navigate = useNavigate();
    useEffect(() => {
      go = (path) => navigate(path);
    }, [navigate]);
    return null;
  }

  it('reports each navigation as its route template, with the previous one as referrer', async () => {
    await render(<Pages />, '/organizations/acme');
    await act(async () => go('/organizations/acme/projects/shop/home'));

    expect(calls(ConsoleAction.PageView)).toEqual([
      { route: '/organizations/:orgHandler', entity_scope: 'organization', referrer_route: undefined },
      { route: '/organizations/:orgHandler/projects/:projectHandler/home', entity_scope: 'project', referrer_route: '/organizations/:orgHandler' },
    ]);
    expect(JSON.stringify(track.mock.calls)).not.toMatch(/acme|shop/);
  });

  it('reports one page view per location under StrictMode', async () => {
    await render(<Pages />, '/organizations/acme', { strict: true });
    await act(async () => go('/organizations/acme/projects/shop/home'));
    expect(calls(ConsoleAction.PageView)).toEqual([
      { route: '/organizations/:orgHandler', entity_scope: 'organization', referrer_route: undefined },
      { route: '/organizations/:orgHandler/projects/:projectHandler/home', entity_scope: 'project', referrer_route: '/organizations/:orgHandler' },
    ]);
  });
});

describe('useSessionAnalytics', () => {
  function Session() {
    useSessionAnalytics();
    return null;
  }

  it('reports the session start once per tab, however often the shell mounts', async () => {
    resetSessionForTest();
    await render(<Session />);
    await unmount();
    await render(<Session />);

    expect(calls(ConsoleAction.SessionStart)).toHaveLength(1);
  });

  it('reports the first session only once per user', async () => {
    resetSessionForTest();
    await render(<Session />);
    await unmount();
    resetSessionForTest();
    await render(<Session />);

    expect(calls(ConsoleAction.SessionStart)).toHaveLength(2);
    expect(calls(ConsoleAction.FirstSession)).toHaveLength(1);
  });

  it('reports where the tab came from as recorded before sign-in, not the sign-in host', async () => {
    resetSessionForTest();
    window.sessionStorage.setItem('icp:console_entry_referrer', 'search');
    Object.defineProperty(document, 'referrer', { value: 'https://auth.example.com/oauth2/authorize', configurable: true });
    await render(<Session />);
    expect(calls(ConsoleAction.SessionStart)).toEqual([expect.objectContaining({ referrer: 'search' })]);
    expect(calls(ConsoleAction.FirstSession)).toEqual([{ referrer: 'search' }]);
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
    window.sessionStorage.clear();
  });

  it('remembers nothing while reporting is off, so the first session is reported once it is on', async () => {
    (window as unknown as { API_CONFIG: object }).API_CONFIG = { consoleAnalyticsEnabled: false };
    resetSessionForTest();
    await render(<Session />);
    await unmount();
    expect(window.localStorage.getItem('icp:console_seen:user-1')).toBeNull();

    // Reporting is turned on; the page loads again.
    (window as unknown as { API_CONFIG: object }).API_CONFIG = { consoleAnalyticsEnabled: true };
    resetSessionForTest();
    await render(<Session />);
    expect(calls(ConsoleAction.SessionStart)).toHaveLength(1);
    expect(calls(ConsoleAction.FirstSession)).toHaveLength(1);
  });

  it("remembers the first session under this console's storage prefix", async () => {
    resetSessionForTest();
    await render(<Session />);
    expect(window.localStorage.getItem('icp:console_seen:user-1')).toBe('1');
    expect(Object.keys(window.localStorage).filter((key) => !key.startsWith('icp:'))).toEqual([]);
  });
});

// The rendered mutation's trigger, for the test to call.
let mutate: () => void = () => {};
function Mutation({ operation, fail }: { operation?: FunnelOperation; fail?: Error }) {
  const { mutate: run } = useMutation({ meta: operation ? { operation } : undefined, mutationFn: async () => (fail ? Promise.reject(fail) : 'ok') });
  mutate = () => run();
  return null;
}

describe('useMutationErrorTracking', () => {
  function Tracker({ children }: { children?: ReactNode }) {
    useMutationErrorTracking();
    return <>{children}</>;
  }
  const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

  it('reports a failed funnel mutation as error-shown, with its status and code', async () => {
    await render(
      <Tracker>
        <Mutation operation="create-integration" fail={new BffError(409, '{"message":"exists","code":"NAME_TAKEN"}')} />
      </Tracker>,
    );
    await act(async () => mutate());
    await settle();
    expect(calls(ConsoleAction.ErrorShown)).toEqual([{ operation: 'create-integration', status: 409, error_code: 'NAME_TAKEN' }]);
  });

  it('reports a scope refusal as permission-denied, for any mutation', async () => {
    await render(
      <Tracker>
        <Mutation fail={new BffError(403, '{"message":"no","code":"INSUFFICIENT_SCOPE","scope":"ipaas:integration:create"}')} />
      </Tracker>,
    );
    await act(async () => mutate());
    await settle();
    expect(calls(ConsoleAction.PermissionDenied)).toEqual([{ feature: 'unspecified', required_permission: 'ipaas:integration:create' }]);
    expect(calls(ConsoleAction.ErrorShown)).toEqual([]);
  });

  it('names a refused mutation outside the funnel by the route pattern ipaas-service sends', async () => {
    await render(
      <Tracker>
        <Mutation fail={new BffError(403, '{"code":"INSUFFICIENT_SCOPE","scope":"ipaas:integration:delete","route":"DELETE /projects/{projectId}/components/{componentId}"}')} />
      </Tracker>,
    );
    await act(async () => mutate());
    await settle();
    expect(calls(ConsoleAction.PermissionDenied)).toEqual([{ feature: 'DELETE /projects/{projectId}/components/{componentId}', required_permission: 'ipaas:integration:delete' }]);
  });

  it('prefers the funnel operation to the route pattern', async () => {
    await render(
      <Tracker>
        <Mutation operation="create-integration" fail={new BffError(403, '{"code":"INSUFFICIENT_SCOPE","scope":"ipaas:integration:create","route":"POST /projects/{projectId}/components"}')} />
      </Tracker>,
    );
    await act(async () => mutate());
    await settle();
    expect(calls(ConsoleAction.PermissionDenied)).toEqual([{ feature: 'create-integration', required_permission: 'ipaas:integration:create' }]);
  });

  it('ignores a failed mutation outside the funnel', async () => {
    await render(
      <Tracker>
        <Mutation fail={new Error('boom')} />
      </Tracker>,
    );
    await act(async () => mutate());
    await settle();
    expect(track).not.toHaveBeenCalled();
  });
});

describe('useConsoleActionWhen', () => {
  let show: (shown: boolean) => void = () => {};
  function EmptyProjects() {
    const [shown, setShown] = useState(true);
    useEffect(() => {
      show = setShown;
    }, []);
    useConsoleActionWhen(shown, ConsoleAction.EmptyState, { resource: 'projects', state: 'no-data' });
    return null;
  }

  it('reports each showing once, under StrictMode too', async () => {
    await render(<EmptyProjects />, '/', { strict: true });
    expect(calls(ConsoleAction.EmptyState)).toHaveLength(1);
    await act(async () => show(false));
    await act(async () => show(true));
    expect(calls(ConsoleAction.EmptyState)).toHaveLength(2);
  });
});

describe('useFormAbandonment', () => {
  function Form({ children }: { children?: ReactNode }) {
    useFormAbandonment('project', 'create-project');
    return <>{children}</>;
  }

  it('reports leaving the form without creating anything', async () => {
    await render(<Form />);
    await unmount();
    expect(calls(ConsoleAction.FormAbandoned)).toEqual([{ entity: 'project', seconds_on_form: 0 }]);
  });

  it('does not report once the create succeeds', async () => {
    await render(
      <Form>
        <Mutation operation="create-project" />
      </Form>,
    );
    await act(async () => mutate());
    await unmount();
    expect(calls(ConsoleAction.FormAbandoned)).toEqual([]);
  });

  it('still reports when a different operation succeeds', async () => {
    await render(
      <Form>
        <Mutation operation="create-integration" />
      </Form>,
    );
    await act(async () => mutate());
    await unmount();
    expect(calls(ConsoleAction.FormAbandoned)).toHaveLength(1);
  });

  it('reports when the tab closes, and only once', async () => {
    await render(<Form />);
    window.dispatchEvent(new Event('pagehide'));
    await unmount();
    expect(calls(ConsoleAction.FormAbandoned)).toHaveLength(1);
  });

  describe('names the form that was left', () => {
    const formPage = '/organizations/:orgHandler/projects/new';
    const abandonedOn = () => track.mock.calls.filter(([name]) => name === ConsoleAction.FormAbandoned).map(([, , options]) => (options as { page?: string } | undefined)?.page);
    beforeEach(() => {
      setConsoleRoutes([{ children: [{ path: 'organizations/:orgHandler/projects/new' }, { path: 'organizations/:orgHandler/projects' }] }]);
      window.history.pushState(null, '', '/organizations/acme/projects/new');
    });
    afterEach(() => window.history.pushState(null, '', '/'));

    it('when the user navigates away, not the page they went to', async () => {
      await render(<Form />);
      // The router moves first; the form unmounts and is reported after.
      window.history.pushState(null, '', '/organizations/acme/projects');
      await unmount();
      expect(abandonedOn()).toEqual([formPage]);
    });

    it('when the tab closes, the same page', async () => {
      await render(<Form />);
      window.dispatchEvent(new Event('pagehide'));
      expect(abandonedOn()).toEqual([formPage]);
    });
  });

  it('does not count StrictMode remounting the page as leaving it', async () => {
    await render(<Form />, '/', { strict: true });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(calls(ConsoleAction.FormAbandoned)).toEqual([]);
    await unmount();
    expect(calls(ConsoleAction.FormAbandoned)).toEqual([{ entity: 'project', seconds_on_form: 0 }]);
  });

  it('sends the report at once when the tab closes, since no timed flush will run', async () => {
    await render(<Form />);
    window.dispatchEvent(new Event('pagehide'));
    expect(flush).toHaveBeenCalledWith(true);
    const reported = track.mock.invocationCallOrder[track.mock.calls.findIndex(([name]) => name === ConsoleAction.FormAbandoned)];
    expect(reported).toBeLessThan(flush.mock.invocationCallOrder[0]);
  });
});
