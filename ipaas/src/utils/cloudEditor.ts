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

import { withBase } from './basePath';

export interface CloudEditorParams {
  userId: string;
  orgUuid: string;
  orgHandle: string;
  projectId: string;
  /** The "Code Server" sample image descriptor, serialized as a query param. */
  codeServerSample: unknown;
  /** localStorage key carrying the AI scaffold prompt/steps, when launched from a plan. */
  scaffoldKey?: string;
}

/** Builds the `/editor` deep link the Cloud Editor is opened with. */
export function buildCloudEditorUrl(params: CloudEditorParams, origin: string): string {
  const url = new URL(withBase('/editor'), origin);
  url.searchParams.set('userId', params.userId);
  url.searchParams.set('orgUuid', params.orgUuid);
  url.searchParams.set('orgHandle', params.orgHandle);
  url.searchParams.set('projectId', params.projectId);
  url.searchParams.set('componentId', 'null');
  url.searchParams.set('codeServerSample', JSON.stringify(params.codeServerSample));
  if (params.scaffoldKey) {
    url.searchParams.set('scaffoldKey', params.scaffoldKey);
  }
  return url.toString();
}

/**
 * The editor URL with its connection token removed, for showing on screen.
 * Navigation keeps using the full URL; an unparseable value is returned unchanged.
 */
export function displayableEditorUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('tkn');
    return u.toString();
  } catch {
    return url;
  }
}
