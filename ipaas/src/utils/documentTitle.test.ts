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

import { describe, it, expect } from 'vitest';
import { pageTitleFor, formatDocumentTitle, APP_NAME } from './documentTitle';

describe('pageTitleFor', () => {
  it('sentence-cases a hyphenated nav id', () => {
    expect(pageTitleFor('health-checks')).toBe('Health checks');
    expect(pageTitleFor('overview')).toBe('Overview');
  });

  it('drops the scope prefix', () => {
    expect(pageTitleFor('org-deploy')).toBe('Deploy');
    expect(pageTitleFor('proj-overview')).toBe('Overview');
  });

  it('uses an override where sentence-casing the id reads wrong', () => {
    expect(pageTitleFor('configs-secrets')).toBe('Configs & secrets');
    expect(pageTitleFor('external-ci')).toBe('External CI');
    expect(pageTitleFor('org-settings')).toBe('Manage');
    expect(pageTitleFor('component-settings')).toBe('Manage');
  });

  it('returns empty for an unknown nav id', () => {
    expect(pageTitleFor(undefined)).toBe('');
    expect(pageTitleFor('')).toBe('');
  });
});

describe('formatDocumentTitle', () => {
  it('joins the page and the app name', () => {
    expect(formatDocumentTitle('Health checks')).toBe(`Health checks | ${APP_NAME}`);
  });

  it('falls back to the app name alone', () => {
    expect(formatDocumentTitle('')).toBe(APP_NAME);
  });
});

describe('acronym nav ids', () => {
  it('keeps RAG as an acronym rather than title-casing it', () => {
    expect(pageTitleFor('org-rag')).toBe('RAG');
  });
});
