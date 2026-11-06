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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import schema from './__fixtures__/ingestion-direct-event.schema.json';

const { engineUpload, engineRequest } = vi.hoisted(() => ({ engineUpload: vi.fn(), engineRequest: vi.fn() }));

vi.mock('./_contextEngineAccess', async (importOriginal) => ({ ...(await importOriginal<typeof import('./_contextEngineAccess')>()), engineUpload, engineRequest }));

import { deleteContextRecord, ingestContextFile } from './contextEngine';
import { changeUploadVisibility, refreshUploads, startUploads } from '../hooks/contextUploads';
import { CONTEXT_ENGINE_FILES_KEY_PREFIX } from '../constants/contextEngine';
import type { FileVisibility } from '../types/contextEngine';

type Schema = Record<string, unknown>;

const KNOWN = new Set(['$comment', '$schema', '$id', 'title', 'description', 'type', 'additionalProperties', 'required', 'properties', 'const', 'enum', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems', 'uniqueItems', 'items']);

/** The subset of JSON Schema the engine's event schema uses; an unknown keyword fails rather than passing silently. */
function violations(s: Schema, v: unknown, at = '$'): string[] {
  const unknown = Object.keys(s).filter((k) => !KNOWN.has(k));
  if (unknown.length) return [`${at}: unsupported schema keywords ${unknown.join(', ')}`];
  const out: string[] = [];
  const fail = (m: string) => out.push(`${at}: ${m}`);
  if ('const' in s && v !== s.const) fail(`must be ${String(s.const)}`);
  if (Array.isArray(s.enum) && !s.enum.includes(v)) fail(`must be one of ${s.enum.join(', ')}`);
  if (s.type === 'string') {
    if (typeof v !== 'string') return [...out, `${at}: must be a string`];
    if (typeof s.minLength === 'number' && v.length < s.minLength) fail('too short');
    if (typeof s.maxLength === 'number' && v.length > s.maxLength) fail('too long');
    if (typeof s.pattern === 'string' && !new RegExp(s.pattern).test(v)) fail(`must match ${s.pattern}`);
    if (s.format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T/.test(v) || Number.isNaN(Date.parse(v)))) fail('must be a date-time');
    if (s.format === 'uri' && !URL.canParse(v)) fail('must be a URI');
  }
  if (s.type === 'array') {
    if (!Array.isArray(v)) return [...out, `${at}: must be an array`];
    if (typeof s.minItems === 'number' && v.length < s.minItems) fail('too few items');
    if (typeof s.maxItems === 'number' && v.length > s.maxItems) fail('too many items');
    if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) fail('items must be unique');
    if (s.items) v.forEach((x, i) => out.push(...violations(s.items as Schema, x, `${at}[${i}]`)));
  }
  if (s.type === 'object') {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return [...out, `${at}: must be an object`];
    const o = v as Record<string, unknown>;
    const props = (s.properties ?? {}) as Record<string, Schema>;
    ((s.required as string[]) ?? []).filter((k) => !(k in o)).forEach((k) => fail(`missing ${k}`));
    if (s.additionalProperties === false)
      Object.keys(o)
        .filter((k) => !(k in props))
        .forEach((k) => fail(`unexpected ${k}`));
    Object.entries(o).forEach(([k, x]) => props[k] && out.push(...violations(props[k], x, `${at}.${k}`)));
  }
  return out;
}

async function sentEvent(call: number): Promise<Record<string, unknown>> {
  const form = engineUpload.mock.calls[call][2] as FormData;
  return JSON.parse(await (form.get('event') as Blob).text()) as Record<string, unknown>;
}

const ENGINE = 'development/docs';
const SUPPORT: FileVisibility = { kind: 'roles', roles: ['support'] };

beforeEach(() => {
  engineUpload.mockReset().mockImplementation(() => Promise.resolve({ jobId: `j${engineUpload.mock.calls.length}`, statusUrl: '/v1/jobs/j' }));
  engineRequest.mockReset().mockImplementation((_e: string, method: string) => (method === 'GET' ? new Promise(() => undefined) : Promise.reject(new Error('not under test'))));
});

describe('ingestion events match the engine contract (ingestion-direct-event.schema.json from integration-context-engine 43ca6f5)', () => {
  it('the schema check itself rejects a field the engine dropped', () => {
    expect(violations(schema, { sourceAclVersion: '1' })).toContain('$: unexpected sourceAclVersion');
  });

  it('an upload is a valid upsert', async () => {
    await ingestContextFile({ engineId: ENGINE, sourceId: 'src_1', recordId: 'notes.md', content: new Blob(['# Notes']), contentType: 'text/markdown', audience: ['console-user'], version: '1761734000000' });
    const event = await sentEvent(0);
    expect(violations(schema, event)).toEqual([]);
    expect(event).toMatchObject({ operation: 'upsert', sourceVersion: '1761734000000', audience: ['console-user'] });
  });

  it('a delete is a valid delete', async () => {
    await deleteContextRecord({ engineId: ENGINE, sourceId: 'src_1', recordId: 'notes.md', audience: ['console-user'], version: '1761734000001' });
    const event = await sentEvent(0);
    expect(violations(schema, event)).toEqual([]);
    expect(event.operation).toBe('delete');
  });

  it('a visibility change is a valid upsert of the same file at a newer version', async () => {
    const content = new File(['# Notes'], 'notes.md', { type: 'text/markdown' });
    startUploads(ENGINE, 'src_2', [{ content, name: 'notes.md', size: content.size, contentType: 'text/markdown' }], undefined, ['console-user'], 'console-user');
    await vi.waitFor(() => expect(engineUpload).toHaveBeenCalledTimes(1));

    await changeUploadVisibility(ENGINE, 'src_2', 'notes.md', SUPPORT, ['console-user', 'support']);

    const [upload, change] = [await sentEvent(0), await sentEvent(1)];
    expect(violations(schema, change)).toEqual([]);
    expect(change).toMatchObject({ operation: 'upsert', sourceRecordId: 'notes.md', contentHash: upload.contentHash, audience: ['console-user', 'support'] });
    expect(BigInt(change.sourceVersion as string)).toBeGreaterThan(BigInt(upload.sourceVersion as string));
    expect((engineUpload.mock.calls[1][2] as FormData).get('content')).not.toBeNull();
  });

  it('a visibility change after a reload sends the file chosen again, and only that file', async () => {
    localStorage.setItem(
      `${CONTEXT_ENGINE_FILES_KEY_PREFIX}src_3`,
      JSON.stringify([{ recordId: 'notes.md', name: 'notes.md', size: 7, contentType: 'text/markdown', audience: ['console-user'], version: '1761734000000', uploadedAt: '2026-10-29T00:00:00Z', jobId: 'j0' }]),
    );
    refreshUploads(ENGINE, 'src_3');

    await expect(changeUploadVisibility(ENGINE, 'src_3', 'notes.md', SUPPORT, ['support'])).rejects.toThrow('choose it again');
    await expect(changeUploadVisibility(ENGINE, 'src_3', 'notes.md', SUPPORT, ['support'], new File(['# Other notes'], 'notes.md'))).rejects.toThrow('Choose the same file');
    expect(engineUpload).not.toHaveBeenCalled();

    await changeUploadVisibility(ENGINE, 'src_3', 'notes.md', SUPPORT, ['support'], new File(['# Notes'], 'notes.md'));
    const change = await sentEvent(0);
    expect(violations(schema, change)).toEqual([]);
    expect(change).toMatchObject({ operation: 'upsert', sourceRecordId: 'notes.md', audience: ['support'] });
    expect(BigInt(change.sourceVersion as string)).toBeGreaterThan(1761734000000n);
  });
});
