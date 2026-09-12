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

  // A private scheme resolves to a locally installed application, so it cannot
  // direct the code at a host of the caller's choosing.
  it.each([
    ['vscode-insiders://wso2.wso2-integrator/ghapp'],
    ['vscodium://wso2.wso2-integrator/ghapp'],
    ['code-oss://wso2.wso2-integrator/ghapp'],
  ])('accepts the private scheme %s', (uri) => {
    expect(editorCallbackUri(state({ callbackUri: uri }))).toBe(uri);
  });

  // `state` is echoed back by GitHub exactly as handed over, so anyone who can
  // start an authorization chooses its contents. The OAuth code travels to
  // whatever this returns, so a network URL is followed only when named.
  it('refuses an https callback that is not allowlisted', () => {
    expect(editorCallbackUri(state({ callbackUri: 'https://evil.example/steal' }))).toBeNull();
    expect(
      editorCallbackUri(state({ callbackUri: 'https://evil.example/steal' }), ['https://editor.example.dev']),
    ).toBeNull();
  });

  it('accepts an https callback whose origin is allowlisted', () => {
    const uri = 'https://editor.example.dev/ghapp?windowId=1';
    expect(editorCallbackUri(state({ callbackUri: uri }), ['https://editor.example.dev'])).toBe(uri);
  });

  // Comparing origins as text would let a trusted origin be a prefix of an
  // attacker's host, and credentials or a port could disguise the real one.
  it.each([
    ['https://editor.example.dev.evil.com/ghapp'],
    ['https://editor.example.dev@evil.com/ghapp'],
    ['https://editor.example.dev:8443/ghapp'],
    ['https://eviledito.example.dev/ghapp'],
  ])('refuses %s against an allowlisted origin', (uri) => {
    expect(editorCallbackUri(state({ callbackUri: uri }), ['https://editor.example.dev'])).toBeNull();
  });

  // A code delivered in plaintext is a code disclosed, whoever receives it.
  it('refuses http even when the host is allowlisted', () => {
    expect(
      editorCallbackUri(state({ callbackUri: 'http://editor.example.dev/ghapp' }), [
        'https://editor.example.dev',
        'http://editor.example.dev',
      ]),
    ).toBeNull();
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['file:///etc/passwd'],
    ['//evil.example/ghapp'],
  ])('refuses %s', (uri) => {
    expect(editorCallbackUri(state({ callbackUri: uri }), ['https://editor.example.dev'])).toBeNull();
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
