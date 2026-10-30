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

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import SetupProgress, { type SetupPhase } from './SetupProgress';

type Props = { component?: string; sx?: unknown; children?: ReactNode; [key: string]: unknown };
const { passthrough } = vi.hoisted(() => ({
  passthrough:
    (tag: string) =>
    ({ component = tag, sx: _sx, children, ...props }: Props) =>
      createElement(component, props, children),
}));

vi.mock('@wso2/oxygen-ui', () => ({
  Box: passthrough('div'),
  Stack: ({ direction: _d, alignItems: _a, justifyContent: _j, gap: _g, ...props }: Props) => passthrough('div')(props),
  Typography: ({ variant: _v, noWrap: _n, ...props }: Props) => passthrough('p')(props),
  Button: ({ variant, size: _s, ...props }: Props) => passthrough('button')({ ...props, 'data-variant': variant }),
  CircularProgress: () => null,
  LinearProgress: () => null,
  Tooltip: ({ title, children }: { title: string; children?: ReactNode }) => createElement('div', { 'data-tooltip': title }, children),
}));
vi.mock('@wso2/oxygen-ui-icons-react', () => ({ Check: () => null, CircleAlert: () => null, FileText: () => null }));
vi.mock('../../../hooks/contextUploads', () => ({ retryUpload: vi.fn(), useSourceUploads: () => [] }));
vi.mock('./UploadStatusChip', () => ({ default: () => null }));

const render = (phase: SetupPhase) => renderToStaticMarkup(<SetupProgress engineId="e1" engineName="Docs" phase={phase} sourceCount={1} roleCount={0} warnings={[]} uploads={[]} onOpen={() => undefined} />);

const openButton = (html: string) => html.match(/<button[^>]*>Open engine<\/button>/)?.[0] ?? '';

describe('SetupProgress', () => {
  it.each<SetupPhase>(['starting', 'setting-up'])('disables Open engine while %s', (phase) => {
    const html = render(phase);
    expect(openButton(html)).toContain('disabled');
    expect(html).toContain('data-tooltip="Available once the engine is running"');
  });

  it.each<SetupPhase>(['done', 'failed'])('enables Open engine when %s', (phase) => {
    const html = render(phase);
    expect(openButton(html)).not.toContain('disabled');
    expect(openButton(html)).toContain('data-variant="contained"');
    expect(html).not.toContain('data-tooltip');
  });
});
