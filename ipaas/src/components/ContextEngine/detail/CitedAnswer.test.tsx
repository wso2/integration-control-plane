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
import CitedAnswer from './CitedAnswer';

// The UI library's bundle pulls in syntax highlighting that Vitest cannot resolve; the renderer only needs these two primitives.
vi.mock('@wso2/oxygen-ui', () => ({
  Box: ({ component = 'div', sx: _sx, children, ...props }: { component?: string; sx?: unknown; children?: ReactNode }) => createElement(component, props, children),
  ButtonBase: ({ sx: _sx, children, ...props }: { sx?: unknown; children?: ReactNode }) => createElement('button', { type: 'button', ...props }, children),
}));

const ANSWER = '## Rollback\n\nOpen the Deploy page and click **Promote** [1]. Rollbacks keep secrets [1][2].\n\n- Pause the workers [2].\n- Then promote the standby. [1]\n\nSee `arr[1]` and an unknown source [9].';

const render = (props: Partial<Parameters<typeof CitedAnswer>[0]> = {}) => renderToStaticMarkup(<CitedAnswer answer={ANSWER} passages={2} active={null} pinned={null} onHover={() => undefined} onPin={() => undefined} {...props} />);

describe('CitedAnswer', () => {
  it('renders the Markdown and turns markers into citation marks', () => {
    const html = render();
    expect(html).toContain('<h2>');
    expect(html).toContain('<strong>Promote</strong>');
    expect(html).toContain('<li>');
    expect(html).toContain('<code>arr[1]</code>');
    expect(html.match(/aria-label="Evidence 1"/g)).toHaveLength(3);
    expect(html.match(/aria-label="Evidence 2"/g)).toHaveLength(2);
    // Nothing is left as raw Markdown or a raw marker, except the number that names no passage.
    expect(html).not.toMatch(/\*\*|## /);
    expect(html.replace(/<code>arr\[1\]<\/code>/, '')).not.toMatch(/\[[12]\]/);
    expect(html).toContain('[9]');
  });

  it('presses every mark of a pinned passage when no sentence is named', () => {
    const html = render({ pinned: { n: 1 } });
    expect(html.match(/aria-label="Evidence 1" aria-pressed="true"/g)).toHaveLength(3);
    expect(html.match(/aria-label="Evidence 2" aria-pressed="false"/g)).toHaveLength(2);
  });

  it('keeps a mark with the sentence before it, ahead of the sentence end', () => {
    const html = render();
    // "Rollbacks keep secrets [1][2]." : the marks come before the full stop, not after it.
    expect(html).toMatch(/Rollbacks keep secrets<button[^>]*aria-label="Evidence 1"[\s\S]*?<\/button><button[^>]*aria-label="Evidence 2"[\s\S]*?<\/button>\./);
  });
});
