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
    Alert: ({ action, children }: { action?: ReactNode; children?: ReactNode }) => createElement('div', null, children, action),
    Box: plain('div'),
    Button: plain('button'),
    CircularProgress: plain('span'),
    Divider: () => null,
    FormControlLabel: ({ control, label }: { control?: ReactNode; label?: ReactNode }) => createElement('label', null, control, label),
    IconButton: plain('button'),
    Skeleton: plain('span'),
    Stack: plain('div'),
    Switch: ({ checked, onChange }: { checked?: boolean; onChange?: (e: unknown, checked: boolean) => void }) =>
      createElement('input', { type: 'checkbox', role: 'switch', checked, onChange: (e: { target: HTMLInputElement }) => onChange?.(e, e.target.checked) }),
    TextField: plain('textarea'),
    ToggleButton: plain('button'),
    ToggleButtonGroup: plain('div'),
    Tooltip: plain('span'),
    Typography: plain('span'),
  };
});
vi.mock('@wso2/oxygen-ui-icons-react', () => {
  const icon = () => null;
  return { Braces: icon, Copy: icon, Eraser: icon, EyeOff: icon, History: icon, Info: icon, RotateCcw: icon, Send: icon, Unlink: icon };
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
vi.mock('./AnsweredTurn', () => ({ default: ({ footer }: { footer: ReactNode }) => footer }));
vi.mock('./EvidenceCard', () => ({ default: () => null }));
vi.mock('./OwnerAccessButton', () => ({ default: ({ onGranted }: { onGranted?: () => void }) => (onGranted ? createElement('button', { 'aria-label': 'Grant access', onClick: onGranted }) : null) }));
vi.mock('./RecentQuestions', () => ({
  default: ({ questions, onOpen }: { questions: AskedQuestion[]; onOpen: (q: AskedQuestion) => void }) => createElement('button', { 'aria-label': 'Open recent', onClick: () => onOpen(questions[0]) }),
}));

import PlaygroundTab from './PlaygroundTab';
import { appendTurn, getPlaygroundConversation, setPlaygroundSearch } from '../../../hooks/contextTurns';
import { rememberQuestion } from '../../../hooks/contextQuestions';
import { HttpError } from '../../../types/http';

const engine = { id: 'e-play', sources: [], models: {}, exposure: { answers: true, agenticSearch: true, defaultSearch: 'deterministic' } } as unknown as ContextEngineDetail;
const result = { queryId: 'qry_1', evidence: [], facts: [] } as unknown as ContextQueryResult;
let root: Root;
let host: HTMLDivElement;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** A fresh tab for an engine, with a question in the box from the URL, as "Ask about this" leaves it. */
function renderEngine(over: Omit<Partial<ContextEngineDetail>, 'exposure'> & { exposure?: Partial<ContextEngineDetail['exposure']> } = {}, path = '/?q=Who%20does%20John%20Doe%20report%20to%3F'): void {
  act(() => root.unmount());
  root = createRoot(host);
  const e = { ...engine, ...over, exposure: { ...engine.exposure, ...over.exposure } } as ContextEngineDetail;
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <PlaygroundTab engine={e} orgHandle="org" />
      </MemoryRouter>,
    ),
  );
}

const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`) ?? [...host.querySelectorAll('button')].find((b) => b.textContent === name) ?? null;
const agenticSwitch = () => host.querySelector<HTMLInputElement>('input[role="switch"]');
const refusal = (status: number, code: string, message: string) => {
  const refused = Promise.reject(new HttpError(status, JSON.stringify({ code, message, traceId: 't' })));
  refused.catch(() => undefined);
  return refused;
};
const QUESTION = 'Who does John Doe report to?';

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  queryContext.mutateAsync.mockReset();
  reopenContext.mutateAsync.mockReset();
  vi.mocked(rememberQuestion).mockClear();
  asked.list = [];
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('PlaygroundTab', () => {
  it('records an answer that arrives after the tab was left', async () => {
    const answer = deferred<{ result: ContextQueryResult; mode: 'answer' }>();
    queryContext.mutateAsync.mockReturnValue(answer.promise);
    renderEngine({}, '/?q=What%20changed%3F');
    act(() => button('Ask')?.click());
    act(() => root.unmount());
    await act(async () => answer.resolve({ result, mode: 'answer' }));
    expect(getPlaygroundConversation(engine.id).turns.map((t) => t.question)).toEqual(['What changed?']);
    expect(rememberQuestion).toHaveBeenCalledWith(expect.objectContaining({ queryId: 'qry_1', question: 'What changed?' }));
    root = createRoot(host);
  });

  it('asks for an answer on an engine that answers and for facts only on one that does not, with no control to choose', () => {
    queryContext.mutateAsync.mockReturnValue(new Promise(() => undefined));
    renderEngine({ id: 'e-answers' });
    expect(host.textContent).not.toMatch(/Ask for|Answer|Context/);
    act(() => button('Ask')?.click());
    expect(queryContext.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ question: QUESTION, mode: 'answer', limit: 15 }));

    renderEngine({ id: 'e-facts', exposure: { answers: false } });
    act(() => button('Ask')?.click());
    expect(queryContext.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ question: QUESTION, mode: 'context' }));
  });

  it("starts with the engine's default search, and the switch changes it", () => {
    queryContext.mutateAsync.mockReturnValue(new Promise(() => undefined));
    renderEngine({ id: 'e-default-agentic', exposure: { defaultSearch: 'agentic' } });
    expect(agenticSwitch()?.checked).toBe(true);
    act(() => button('Ask')?.click());
    expect(queryContext.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'agentic' }));

    renderEngine({ id: 'e-default-deterministic' });
    expect(agenticSwitch()?.checked).toBe(false);
    act(() => agenticSwitch()?.click());
    expect(getPlaygroundConversation('e-default-deterministic').search).toBe('agentic');
    act(() => button('Ask')?.click());
    expect(queryContext.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'agentic' }));
  });

  it('hides agentic search on an engine that does not offer it, and asks with its own search', () => {
    queryContext.mutateAsync.mockReturnValue(new Promise(() => undefined));
    setPlaygroundSearch('e-plain', 'agentic');
    renderEngine({ id: 'e-plain', exposure: { agenticSearch: false, defaultSearch: 'agentic' } });
    expect(agenticSwitch()).toBeNull();
    expect(host.textContent).not.toContain('Agentic search');
    act(() => button('Ask')?.click());
    expect(queryContext.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'deterministic' }));
  });

  it('shows how long an agentic search has been running, as it takes a minute or more', () => {
    queryContext.mutateAsync.mockReturnValue(new Promise(() => undefined));
    renderEngine({ id: 'e-progress', exposure: { defaultSearch: 'agentic' } });
    act(() => button('Ask')?.click());
    expect(host.textContent).toContain('Agentic search is exploring the context graph, then the answer is written…');
    expect(host.textContent).toMatch(/the answer is written…\d+ s(?! ·)/);
  });

  it("shows the facts with a notice when the answer couldn't be written", async () => {
    const facts = { queryId: 'qry_2', state: 'completed', evidence: [], facts: [], conflicts: [], insufficientEvidence: false, traceId: 't2' } as ContextQueryResult;
    queryContext.mutateAsync.mockResolvedValue({ result: facts, mode: 'context', answerError: "The engine's answer model rejected its API key" });
    renderEngine({ id: 'e-fallback' });
    await act(async () => button('Ask')?.click());
    expect(host.textContent).toContain("The answer couldn't be written");
    expect(host.textContent).toContain("The engine's answer model rejected its API key. Here is what the search found.");
    expect(getPlaygroundConversation('e-fallback').turns[0]).toMatchObject({ mode: 'context', answerError: "The engine's answer model rejected its API key" });
    // The stored query is the facts-only one, so it reopens as facts.
    expect(rememberQuestion).toHaveBeenCalledWith(expect.objectContaining({ queryId: 'qry_2', mode: 'context' }));
  });

  it('says what the engine does not offer when it refuses a question with not_offered', async () => {
    queryContext.mutateAsync.mockReturnValueOnce(refusal(400, 'not_offered', 'Agentic search is not offered by this engine.'));
    renderEngine({ id: 'e-no-agentic', exposure: { defaultSearch: 'agentic' } });
    await act(async () => button('Ask')?.click());
    expect(host.textContent).toContain('This engine does not offer agentic search.');

    queryContext.mutateAsync.mockReturnValueOnce(refusal(400, 'not_offered', 'Answers are not offered by this engine.'));
    renderEngine({ id: 'e-no-answers' });
    await act(async () => button('Ask')?.click());
    expect(host.textContent).toContain('This engine does not offer answers.');
  });

  it('retries a refused question with the search it was asked with, even after the search changed', async () => {
    queryContext.mutateAsync.mockReturnValueOnce(refusal(403, 'access_denied', 'forbidden')).mockReturnValue(new Promise(() => undefined));
    renderEngine({ id: 'e-retry' });
    await act(async () => button('Ask')?.click());
    expect(queryContext.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ question: QUESTION, mode: 'answer', search: 'deterministic' }));
    act(() => setPlaygroundSearch('e-retry', 'agentic'));
    act(() => button('Grant access')?.click());
    expect(queryContext.mutateAsync).toHaveBeenCalledTimes(2);
    expect(queryContext.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ question: QUESTION, mode: 'answer', search: 'deterministic' }));
  });

  it('holds asking and clearing while a recent question is being reopened', () => {
    appendTurn('e-hold', { question: 'Earlier', mode: 'context', result });
    asked.list = [{ queryId: 'qry_0', engineId: 'e-hold', question: 'Earlier', mode: 'context', askedAt: '2026-01-01T00:00:00Z', outcome: 'answered', passages: 1 } as AskedQuestion];
    reopenContext.mutateAsync.mockReturnValue(new Promise(() => undefined));
    renderEngine({ id: 'e-hold' }, '/?q=Next');
    expect(button('Ask')?.disabled).toBe(false);
    act(() => button('Open recent')?.click());
    expect(button('Ask')?.disabled).toBe(true);
    expect(button('Clear conversation')?.disabled).toBe(true);
    act(() => button('Ask')?.click());
    expect(queryContext.mutateAsync).not.toHaveBeenCalled();
  });
});
