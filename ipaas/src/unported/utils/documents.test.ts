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
import { typeLabel, getMajorVersion, aggregateByMajorVersion, stripLeadingTitle } from './documents';
import type { ApiDocument } from '../../types/marketplace';
import type { DeploymentTrack } from '../../types/component';

// ── helpers ───────────────────────────────────────────────────────────────────

function doc(overrides: Partial<ApiDocument> & Pick<ApiDocument, 'type'>): ApiDocument {
  return { documentId: 'id', name: 'name', ...overrides };
}

function track(overrides: Partial<DeploymentTrack> & Pick<DeploymentTrack, 'id'>): DeploymentTrack {
  return { ...overrides };
}

// ── typeLabel ─────────────────────────────────────────────────────────────────

describe('typeLabel', () => {
  it.each([
    ['HOWTO', 'How To'],
    ['SAMPLES', 'Sample and SDK'],
    ['PUBLIC_FORUM', 'Public Forum'],
    ['SUPPORT_FORUM', 'Support Forum'],
  ])('maps known type %s to %s', (type, expected) => {
    expect(typeLabel(doc({ type }))).toBe(expected);
  });

  it('returns otherTypeName for OTHER type', () => {
    expect(typeLabel(doc({ type: 'OTHER', otherTypeName: 'Release Notes' }))).toBe('Release Notes');
  });

  it('falls back to "Other" for OTHER type without otherTypeName', () => {
    expect(typeLabel(doc({ type: 'OTHER' }))).toBe('Other');
  });

  it('returns the raw type string for unknown types', () => {
    expect(typeLabel(doc({ type: 'UNKNOWN_TYPE' }))).toBe('UNKNOWN_TYPE');
  });
});

// ── getMajorVersion ───────────────────────────────────────────────────────────

describe('getMajorVersion', () => {
  it('strips lowercase v prefix', () => {
    expect(getMajorVersion('v1.2.3')).toBe('1');
  });

  it('strips uppercase V prefix', () => {
    expect(getMajorVersion('V2.0.0')).toBe('2');
  });

  it('handles version strings without a prefix', () => {
    expect(getMajorVersion('3.5.1')).toBe('3');
  });

  it('handles a bare major number', () => {
    expect(getMajorVersion('4')).toBe('4');
  });
});

// ── aggregateByMajorVersion ───────────────────────────────────────────────────

describe('aggregateByMajorVersion', () => {
  it('returns an empty array for no tracks', () => {
    expect(aggregateByMajorVersion([])).toEqual([]);
  });

  it('keeps tracks without an apiVersion under their own id', () => {
    const t = track({ id: 'no-version' });
    const result = aggregateByMajorVersion([t]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('no-version');
  });

  it('groups tracks sharing a major version under a single x-suffixed key', () => {
    const t1 = track({ id: 'a', apiVersion: 'v1.0.0' });
    const t2 = track({ id: 'b', apiVersion: 'v1.2.0' });
    const result = aggregateByMajorVersion([t1, t2]);
    expect(result).toHaveLength(1);
    expect(result[0].apiVersion).toBe('1.x');
  });

  it('the latest-flagged track wins when major versions collide', () => {
    const old = track({ id: 'old', apiVersion: 'v2.0.0' });
    const latest = track({ id: 'latest', apiVersion: 'v2.5.0', latest: true });
    const result = aggregateByMajorVersion([old, latest]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('latest');
    expect(result[0].apiVersion).toBe('2.x');
  });

  it('keeps distinct major versions as separate entries', () => {
    const v1 = track({ id: 'v1', apiVersion: 'v1.0.0' });
    const v2 = track({ id: 'v2', apiVersion: 'v2.0.0' });
    const result = aggregateByMajorVersion([v1, v2]);
    expect(result).toHaveLength(2);
    const versions = result.map((t) => t.apiVersion).sort();
    expect(versions).toEqual(['1.x', '2.x']);
  });

  it('mixes versioned and unversioned tracks correctly', () => {
    const unversioned = track({ id: 'bare' });
    const versioned = track({ id: 'v1', apiVersion: 'v1.0.0' });
    const result = aggregateByMajorVersion([unversioned, versioned]);
    expect(result).toHaveLength(2);
  });
});

// ── stripLeadingTitle ─────────────────────────────────────────────────────────

describe('stripLeadingTitle', () => {
  it('strips a h1 heading that matches the document name', () => {
    const content = '# My Doc\n\nSome body text.';
    expect(stripLeadingTitle(content, 'My Doc')).toBe('Some body text.');
  });

  it('strips a h2 heading that matches the document name', () => {
    const content = '## My Doc\n\nBody.';
    expect(stripLeadingTitle(content, 'My Doc')).toBe('Body.');
  });

  it('is case-insensitive when matching', () => {
    const content = '# MY DOC\n\nBody.';
    expect(stripLeadingTitle(content, 'my doc')).toBe('Body.');
  });

  it('leaves content unchanged when heading does not match the document name', () => {
    const content = '# Different Title\n\nBody.';
    expect(stripLeadingTitle(content, 'My Doc')).toBe(content);
  });

  it('leaves content unchanged when there is no heading', () => {
    const content = 'Just plain text.';
    expect(stripLeadingTitle(content, 'My Doc')).toBe(content);
  });

  it('returns empty string when heading is the only content', () => {
    expect(stripLeadingTitle('# My Doc', 'My Doc')).toBe('');
  });
});
