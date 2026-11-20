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

// The UI library's bundle pulls in syntax highlighting that Vitest cannot resolve; the renderer only needs this primitive.
vi.mock('@wso2/oxygen-ui', () => ({
  Box: ({ component = 'div', sx: _sx, children, ...props }: { component?: string; sx?: unknown; children?: ReactNode }) => createElement(component, props, children),
}));

const ANSWER = '## Rollback\n\nOpen the Deploy page and click **Promote** [1]. Rollbacks keep secrets [1][2].\n\n- Pause the workers [2].\n- Then promote the standby. [1]\n\nSee `arr[1]` and an unknown source [9].';

const render = (props: Partial<Parameters<typeof CitedAnswer>[0]> = {}) => renderToStaticMarkup(<CitedAnswer answer={ANSWER} passages={2} active={null} pinned={null} onHover={() => undefined} onPin={() => undefined} {...props} />);

describe('CitedAnswer', () => {
  it('renders the Markdown and drops the citation markers', () => {
    const html = render();
    expect(html).toContain('<h2>');
    expect(html).toContain('<strong>Promote</strong>');
    expect(html).toContain('<li>');
    expect(html).toContain('<code>arr[1]</code>');
    // No marks are drawn and no raw marker is left, except the number that names no passage.
    expect(html).not.toContain('aria-label="Evidence');
    expect(html).not.toMatch(/\*\*|## /);
    expect(html.replace(/<code>arr\[1\]<\/code>/, '')).not.toMatch(/\[[12]\]/);
    expect(html).toContain('[9]');
  });

  it('keeps the sentence and its full stop together once the markers are gone', () => {
    // The word before a dropped marker and the full stop after it still sit together.
    expect(render()).toMatch(/Rollbacks keep (<[^>]+>)*secrets\./);
    expect(render({ answer: 'Edit /opt/wso2/conf/deployment.toml [1].' })).toMatch(/deployment\.(<[^>]+>)*toml(<[^>]+>)*\./);
  });

  it('reads citations only where the engine does', () => {
    // Subscripts, reference links and code are left as written; only the real marker is dropped.
    const html = render({ answer: 'Use items[1], ``b[1]``, and [2].' });
    expect(html).toContain('items[1]');
    expect(html).toContain('<code>b[1]</code>');
    expect(html).not.toMatch(/and \[2\]/);
  });
});
