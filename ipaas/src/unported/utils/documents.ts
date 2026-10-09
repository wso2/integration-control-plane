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

import type { DeploymentTrack } from '../../types/component';
import type { ApiDocument } from '../../types/marketplace';

const DOC_TYPE_LABEL: Record<string, string> = {
  HOWTO: 'How To',
  SAMPLES: 'Sample and SDK',
  PUBLIC_FORUM: 'Public Forum',
  SUPPORT_FORUM: 'Support Forum',
};

export function typeLabel(doc: ApiDocument): string {
  return doc.type === 'OTHER' ? (doc.otherTypeName ?? 'Other') : (DOC_TYPE_LABEL[doc.type] ?? doc.type);
}

export function getMajorVersion(apiVersion: string): string {
  return apiVersion.replace(/^v/i, '').split('.')[0];
}

export function aggregateByMajorVersion(tracks: DeploymentTrack[]): DeploymentTrack[] {
  const groups = new Map<string, DeploymentTrack>();
  for (const track of tracks) {
    if (!track.apiVersion) {
      groups.set(track.id, track);
      continue;
    }
    const key = `${getMajorVersion(track.apiVersion)}.x`;
    const existing = groups.get(key);
    if (!existing || track.latest) {
      groups.set(key, { ...track, apiVersion: key });
    }
  }
  return Array.from(groups.values());
}

export function stripLeadingTitle(content: string, docName: string): string {
  const firstLine = content.match(/^#+ .+/m)?.[0] ?? '';
  const heading = firstLine.replace(/^#+ /, '').trim();
  if (heading.toLowerCase() === docName.toLowerCase()) {
    return content.replace(firstLine, '').trimStart();
  }
  return content;
}
