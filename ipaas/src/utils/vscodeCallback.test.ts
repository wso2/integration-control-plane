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

import { describe, expect, it } from 'vitest';
import { buildEditorCallbackUrl, editorCallbackUri, editorStateOrgId } from './vscodeCallback';

const state = (value: unknown): string => btoa(JSON.stringify(value));

describe('editorCallbackUri', () => {
  it('returns the callback an editor asked for', () => {
    const s = state({ origin: 'vscode.choreo.ext', orgId: 'org-1', callbackUri: 'vscode://wso2.wso2-integrator/ghapp' });
    expect(editorCallbackUri(s)).toBe('vscode://wso2.wso2-integrator/ghapp');
  });

  it.each([
    ['vscode-insiders://wso2.wso2-integrator/ghapp'],
    ['vscodium://wso2.wso2-integrator/ghapp'],
    ['https://editor.example.dev/ghapp'],
  ])('accepts %s', (uri) => {
    expect(editorCallbackUri(state({ callbackUri: uri }))).toBe(uri);
  });

  // `state` reaches this page by way of GitHub, so it is not trusted input.
  // Navigating to an unchecked value would make this an open redirect.
  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['file:///etc/passwd'],
  ])('refuses %s', (uri) => {
    expect(editorCallbackUri(state({ callbackUri: uri }))).toBeNull();
  });

  // The console's own popup flow sends opaque values here and must keep using
  // the BroadcastChannel, so anything unreadable has to mean "not an editor".
  it.each([
    ['null state', null],
    ['not base64', '!!!!'],
    ['base64 but not JSON', btoa('nonsense')],
    ['JSON without a callback', state({ orgId: 'org-1' })],
    ['an empty callback', state({ callbackUri: '' })],
    ['a non-string callback', state({ callbackUri: 42 })],
  ])('returns null for %s', (_name, value) => {
    expect(editorCallbackUri(value as string | null)).toBeNull();
  });
});

describe('buildEditorCallbackUrl', () => {
  it('appends the result', () => {
    expect(buildEditorCallbackUrl('vscode://x/ghapp', { code: 'abc', orgId: 'org-1' })).toBe(
      'vscode://x/ghapp?code=abc&orgId=org-1',
    );
  });

  // The editor may already have put a query on its callback; replacing it would
  // drop whatever it needs to correlate the result.
  it('preserves an existing query', () => {
    expect(buildEditorCallbackUrl('vscode://x/ghapp?windowId=7', { code: 'abc' })).toBe(
      'vscode://x/ghapp?windowId=7&code=abc',
    );
  });

  it('omits absent values rather than sending empties', () => {
    expect(buildEditorCallbackUrl('vscode://x/ghapp', { code: 'abc', orgId: null, setup_action: '' })).toBe(
      'vscode://x/ghapp?code=abc',
    );
  });

  it('encodes values', () => {
    expect(buildEditorCallbackUrl('vscode://x/ghapp', { code: 'a b&c' })).toBe('vscode://x/ghapp?code=a%20b%26c');
  });
});

describe('editorStateOrgId', () => {
  it('reads the org id', () => expect(editorStateOrgId(state({ orgId: 'org-1' }))).toBe('org-1'));
  it('returns null when absent', () => expect(editorStateOrgId(state({}))).toBeNull());
  it('returns null for an unreadable state', () => expect(editorStateOrgId('!!!')).toBeNull());
});
