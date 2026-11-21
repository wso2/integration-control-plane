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
import AnswerMarkdown from './AnswerMarkdown';

// The UI library's bundle pulls in syntax highlighting that Vitest cannot resolve; the renderer only needs this primitive.
vi.mock('@wso2/oxygen-ui', () => ({
  Box: ({ component = 'div', sx: _sx, children, ...props }: { component?: string; sx?: unknown; children?: ReactNode }) => createElement(component, props, children),
}));

const render = (answer: string) => renderToStaticMarkup(<AnswerMarkdown answer={answer} />);

describe('AnswerMarkdown', () => {
  it('renders the Markdown the model wrote', () => {
    const html = render('## Reporting\n\nJohn Doe reports to **Priya Raman**.\n\n- Engineering\n- Design\n\nSee `org-chart`.');
    expect(html).toContain('<h2>Reporting</h2>');
    expect(html).toContain('<strong>Priya Raman</strong>');
    expect(html).toContain('<li>Engineering</li>');
    expect(html).toContain('<code>org-chart</code>');
  });

  it('treats the text as untrusted: no raw HTML, no script links, and links open away from the console', () => {
    const html = render('Hi <img src=x onerror="alert(1)"> there. [Click](javascript:alert(1)) or [the handbook](https://example.com/handbook).');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<a href="https://example.com/handbook" target="_blank" rel="noopener noreferrer">the handbook</a>');
  });
});
