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
import { decodeBase64Spec, specFileType } from './openApiSpec';

const encode = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

describe('decodeBase64Spec', () => {
  it('decodes a yaml spec', () => {
    expect(decodeBase64Spec(encode('openapi: 3.0.0\ninfo:\n  title: Orders\n'))).toBe('openapi: 3.0.0\ninfo:\n  title: Orders\n');
  });

  it('keeps non-ASCII characters intact', () => {
    expect(decodeBase64Spec(encode('info:\n  title: Café — Ordenes\n'))).toContain('Café — Ordenes');
  });

  it('returns null for nothing to decode', () => {
    expect(decodeBase64Spec(undefined)).toBeNull();
    expect(decodeBase64Spec(null)).toBeNull();
    expect(decodeBase64Spec('')).toBeNull();
    expect(decodeBase64Spec('   ')).toBeNull();
  });

  it('returns null when the payload is not base64', () => {
    expect(decodeBase64Spec('not base64!!')).toBeNull();
  });

  // An all-whitespace result is treated as no spec rather than an empty one.
  it('returns null when the decoded spec is blank', () => {
    expect(decodeBase64Spec(encode('   \n  '))).toBeNull();
  });
});

describe('specFileType', () => {
  it('detects json', () => {
    expect(specFileType('{"openapi":"3.0.0"}')).toEqual({ extension: 'json', mimeType: 'application/json' });
    expect(specFileType('\n  {"openapi":"3.0.0"}')).toEqual({ extension: 'json', mimeType: 'application/json' });
  });

  it('defaults to yaml', () => {
    expect(specFileType('openapi: 3.0.0')).toEqual({ extension: 'yaml', mimeType: 'application/yaml' });
  });
});
