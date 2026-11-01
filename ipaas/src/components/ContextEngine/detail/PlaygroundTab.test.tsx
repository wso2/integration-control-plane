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

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskedQuestion, ContextEngineDetail, ContextQueryResult } from '../../../types/contextEngine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The UI library's bundle pulls in syntax highlighting that Vitest cannot resolve; plain elements are enough to click.
vi.mock('@wso2/oxygen-ui', () => {
  const plain =
    (tag: string) =>
    ({
      component,
      sx: _sx,
      startIcon: _s,
      endIcon: _e,
      variant: _v,
      size: _z,
      color: _c,
      exclusive: _x,
      fullWidth: _f,
      multiline: _m,
      minRows: _n,
      maxRows: _r,
      inputProps,
      onChange,
      value,
      children,
      ...props
    }: Record<string, unknown> & { children?: ReactNode }) =>
      tag === 'textarea' ? createElement('textarea', { ...props, ...(inputProps as object), value, onChange }) : createElement(typeof component === 'string' ? component : tag, props, children);
  return {
    Alert: plain('div'),
    Box: plain('div'),
    Button: plain('button'),
    CircularProgress: plain('span'),
    IconButton: plain('button'),
    Stack: plain('div'),
    TextField: plain('textarea'),
    ToggleButton: plain('button'),
    ToggleButtonGroup: plain('div'),
    Tooltip: plain('span'),
    Typography: plain('span'),
  };
});
vi.mock('@wso2/oxygen-ui-icons-react', () => {
  const icon = () => null;
  return { Braces: icon, Copy: icon, Eraser: icon, EyeOff: icon, History: icon, RotateCcw: icon, Send: icon, Unlink: icon };
});

const queryContext = vi.hoisted(() => ({ mutateAsync: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }));
const reopenContext = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
const asked = vi.hoisted(() => ({ list: [] as AskedQuestion[] }));
vi.mock('../../../hooks/useContextEngine', () => ({
  useAskedFlag: () => ({ asked: false, markAsked: () => undefined }),
  useContextPermissions: () => ({ data: ['context.read'] }),
  useContextPrincipal: () => ({ data: undefined }),
  useQueryContextEngine: () => queryContext,
  useReopenContextQuery: () => reopenContext,
}));
vi.mock('../../../hooks/contextQuestions', () => ({
  forgetQuestion: vi.fn(),
  rememberQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  useAskedQuestions: () => asked.list,
}));
vi.mock('../../../hooks/useAppNavigate', () => ({ useAppNavigate: () => vi.fn() }));
vi.mock('./AnsweredTurn', () => ({ default: () => null }));
vi.mock('./EvidenceCard', () => ({ default: () => null }));
vi.mock('./OwnerAccessButton', () => ({ default: () => null }));
vi.mock('./RecentQuestions', () => ({
  default: ({ questions, onOpen }: { questions: AskedQuestion[]; onOpen: (q: AskedQuestion) => void }) => createElement('button', { 'aria-label': 'Open recent', onClick: () => onOpen(questions[0]) }),
}));

import PlaygroundTab from './PlaygroundTab';
import { appendTurn, getPlaygroundConversation } from '../../../hooks/contextTurns';
import { rememberQuestion } from '../../../hooks/contextQuestions';

const engine = { id: 'e-play', sources: [], models: {}, exposure: { answers: true } } as unknown as ContextEngineDetail;
const result = { queryId: 'qry_1', evidence: [] } as unknown as ContextQueryResult;
let root: Root;
let host: HTMLDivElement;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function render(path = '/'): void {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <PlaygroundTab engine={engine} orgHandle="org" />
      </MemoryRouter>,
    ),
  );
}

const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`) ?? [...host.querySelectorAll('button')].find((b) => b.textContent === name) ?? null;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  queryContext.mutateAsync.mockReset();
  reopenContext.mutateAsync.mockReset();
  asked.list = [];
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('PlaygroundTab', () => {
  it('records an answer that arrives after the tab was left', async () => {
    const answer = deferred<ContextQueryResult>();
    queryContext.mutateAsync.mockReturnValue(answer.promise);
    render('/?q=What%20changed%3F');
    act(() => button('Ask')?.click());
    act(() => root.unmount());
    await act(async () => answer.resolve(result));
    expect(getPlaygroundConversation(engine.id).turns.map((t) => t.question)).toEqual(['What changed?']);
    expect(rememberQuestion).toHaveBeenCalledWith(expect.objectContaining({ queryId: 'qry_1', question: 'What changed?' }));
    root = createRoot(host);
  });

  it('holds asking and clearing while a recent question is being reopened', () => {
    appendTurn('e-hold', { question: 'Earlier', mode: 'context', result });
    asked.list = [{ queryId: 'qry_0', engineId: 'e-hold', question: 'Earlier', mode: 'context', askedAt: '2026-01-01T00:00:00Z', outcome: 'answered', passages: 1 } as AskedQuestion];
    reopenContext.mutateAsync.mockReturnValue(new Promise(() => undefined));
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/?q=Next']}>
          <PlaygroundTab engine={{ ...engine, id: 'e-hold' }} orgHandle="org" />
        </MemoryRouter>,
      ),
    );
    expect(button('Ask')?.disabled).toBe(false);
    act(() => button('Open recent')?.click());
    expect(button('Ask')?.disabled).toBe(true);
    expect(button('Clear conversation')?.disabled).toBe(true);
    act(() => button('Ask')?.click());
    expect(queryContext.mutateAsync).not.toHaveBeenCalled();
  });
});
