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
import { componentSubTypeFromSample, getDisplayLabel, isSupportedIntegration } from './integrations';

describe('project listing — RAG components', () => {
  it('labels the ingestion cronjob as "RAG Ingestion" (not Automation)', () => {
    expect(getDisplayLabel('byoiCronjob', 'rag-ingestion')).toBe('RAG Ingestion');
    // a plain byoiCronjob with no RAG subtype still reads as Automation
    expect(getDisplayLabel('byoiCronjob', null)).toBe('Automation');
  });

  it('labels every foreign-runtime component "Other"', () => {
    expect(getDisplayLabel('otherAiAgent', null)).toBe('Other');
    expect(getDisplayLabel('otherService', null)).toBe('Other');
    expect(getDisplayLabel('other', null)).toBe('Other');
  });

  it('labels the RAG services as Integration as API', () => {
    expect(getDisplayLabel('byoiService', 'rag-retrieval-service')).toBe('Integration as API');
    expect(getDisplayLabel('byoiService', 'rag-service')).toBe('Integration as API');
  });

  it('treats all RAG components as supported (navigable, not disabled)', () => {
    expect(isSupportedIntegration('byoiCronjob', 'rag-ingestion')).toBe(true);
    expect(isSupportedIntegration('byoiService', 'rag-retrieval-service')).toBe(true);
    expect(isSupportedIntegration('byoiService', 'rag-service')).toBe(true);
  });
});

describe('project listing — foreign runtimes', () => {
  it('keeps the displayType verdict when no buildpack is reported', () => {
    // Only cloud sends buildpackType; absent must not exclude every wip component.
    expect(isSupportedIntegration('ballerinaService', null, undefined)).toBe(true);
    expect(isSupportedIntegration('ballerinaService', null, 'BI')).toBe(true);
    expect(isSupportedIntegration('miApiService', null, 'MI')).toBe(true);
  });

  it("excludes another platform's runtime whatever its displayType looks like", () => {
    expect(isSupportedIntegration('ballerinaService', null, 'other')).toBe(false);
    // MCP short-circuits the displayType allowlist, so the buildpack has to win over it.
    expect(isSupportedIntegration('otherService', 'MCP', 'other')).toBe(false);
  });
});

describe('componentSubTypeFromSample', () => {
  it('subtypes webhook samples so create stamps the component-type annotation', () => {
    expect(componentSubTypeFromSample('webhook', 'ballerina')).toBe('webhook');
    expect(componentSubTypeFromSample('webhook', 'wso2-mi')).toBe('webhook');
  });

  it('leaves categories that need no further subtyping undefined', () => {
    expect(componentSubTypeFromSample('service', 'ballerina')).toBeUndefined();
    expect(componentSubTypeFromSample('scheduled-task', 'ballerina')).toBeUndefined();
    expect(componentSubTypeFromSample('event-handler', 'ballerina')).toBeUndefined();
  });
});
