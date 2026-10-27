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

/**
 * The bytes of files chosen in the create wizard, keyed by staged-file id.
 *
 * They live outside the form state: a `File` cannot be serialised into the
 * session-storage draft, so a restored draft keeps only names and sizes and asks
 * for the files again. The map is per page load, which is exactly the lifetime
 * of a chosen file in a browser.
 */
import { contentTypeForFile } from './contextEngine';
import type { StagedFileMeta } from '../types/contextEngine';

const files = new Map<string, Blob>();

export function putStagedFile(id: string, file: Blob): void {
  files.set(id, file);
}

export function getStagedFile(id: string): Blob | undefined {
  return files.get(id);
}

export function hasStagedFile(id: string): boolean {
  return files.has(id);
}

export function dropStagedFile(id: string): void {
  files.delete(id);
}

export function newStagedFileId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Add chosen files to a source's staged list: a name already staged is replaced, and a file missing its bytes gets them back. */
export function stageFiles(staged: StagedFileMeta[], files: File[]): StagedFileMeta[] {
  let next = [...staged];
  for (const file of files) {
    const meta: StagedFileMeta = { id: newStagedFileId(), name: file.name, size: file.size, contentType: contentTypeForFile(file.name, file.type) };
    const existing = next.find((f) => f.name === file.name);
    if (existing) {
      if (!hasStagedFile(existing.id)) {
        // A restored draft: the same name slots straight back in.
        putStagedFile(existing.id, file);
        next = next.map((f) => (f.id === existing.id ? { ...existing, size: file.size, contentType: meta.contentType } : f));
        continue;
      }
      dropStagedFile(existing.id);
      next = next.filter((f) => f.id !== existing.id);
    }
    putStagedFile(meta.id, file);
    next.push(meta);
  }
  return next;
}
