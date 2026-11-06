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
import { componentSubTypeFromSample, formatBuildPack, getDisplayLabel, isSupportedIntegration, sampleId, samplePath, sampleSourceUrl } from './integrations';

describe('project listing — RAG components', () => {
  it('labels the ingestion cronjob as "RAG Ingestion" (not Automation)', () => {
    expect(getDisplayLabel('byoiCronjob', 'rag-ingestion')).toBe('RAG Ingestion');
    // a plain byoiCronjob with no RAG subtype still reads as Automation
    expect(getDisplayLabel('byoiCronjob', null)).toBe('Automation');
  });

  it('labels a knowledge base\'s service and data sources', () => {
    expect(getDisplayLabel('service', 'knowledge-base')).toBe('Knowledge Base Service');
    expect(getDisplayLabel('automation', 'kb-ingestion')).toBe('Knowledge Base Data Source');
    expect(isSupportedIntegration('service', 'knowledge-base')).toBe(true);
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

  it('treats a voice agent as a supported integration with its own label', () => {
    expect(isSupportedIntegration('voiceAgent', null)).toBe(true);
    expect(getDisplayLabel('voiceAgent', null)).toBe('Voice Agent');
  });
});

describe('project listing — foreign runtimes', () => {
  it('keeps the displayType verdict when no buildpack is reported', () => {
    // A component without a buildpackType keeps the displayType verdict.
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
  it("subtypes webhook samples so create stamps the component-type annotation", () => {
    expect(componentSubTypeFromSample('webhook', 'ballerina')).toBe('webhook');
    expect(componentSubTypeFromSample('webhook', 'wso2-mi')).toBe('webhook');
  });

  it('leaves categories that need no further subtyping undefined', () => {
    expect(componentSubTypeFromSample('service', 'ballerina')).toBeUndefined();
    expect(componentSubTypeFromSample('scheduled-task', 'ballerina')).toBeUndefined();
    expect(componentSubTypeFromSample('event-handler', 'ballerina')).toBeUndefined();
  });
});

describe('formatBuildPack', () => {
  it('names the sample buildpacks as the import flow names the technologies', () => {
    expect(formatBuildPack('ballerina')).toBe('WSO2 Integrator');
    expect(formatBuildPack('wso2-mi')).toBe('WSO2 Integrator: MI');
  });

  it('shows an unknown buildpack as reported', () => {
    expect(formatBuildPack('java')).toBe('java');
  });
});

describe('samplePath', () => {
  it('keeps the catalog path as it is, leading slash included', () => {
    expect(samplePath({ componentPath: '/integrator-default-profile/samples/hello-world-service' })).toBe('/integrator-default-profile/samples/hello-world-service');
    expect(samplePath({ subDirectory: '/bi', componentPath: '/hello-world' })).toBe('/bi/hello-world');
  });

  it('joins the parts with one slash whether or not either supplies one', () => {
    expect(samplePath({ subDirectory: 'bi', componentPath: 'hello-world' })).toBe('bi/hello-world');
    expect(samplePath({ subDirectory: 'bi/', componentPath: '/hello-world' })).toBe('bi/hello-world');
    expect(samplePath({ subDirectory: '', componentPath: '' })).toBe('');
  });
});

describe('sampleId', () => {
  it('is the sample path in its repository, without a leading slash', () => {
    expect(sampleId({ subDirectory: 'bi', componentPath: '/hello-world' })).toBe('bi/hello-world');
    expect(sampleId({ componentPath: '/hello-world' })).toBe('hello-world');
  });

  it('joins the parts with one slash whether or not the path starts with one', () => {
    expect(sampleId({ subDirectory: 'bi', componentPath: 'hello-world' })).toBe('bi/hello-world');
    expect(sampleId({ subDirectory: 'bi/', componentPath: '/hello-world' })).toBe('bi/hello-world');
    expect(sampleId({ componentPath: 'hello-world' })).toBe('hello-world');
  });
});

describe('sampleSourceUrl', () => {
  const repositoryUrl = 'https://github.com/wso2/integration-samples/';

  it('links the catalog sample to its folder on the main branch', () => {
    expect(sampleSourceUrl({ repositoryUrl, componentPath: '/integrator-default-profile/samples/hello-world-service' })).toBe('https://github.com/wso2/integration-samples/tree/main/integrator-default-profile/samples/hello-world-service');
  });

  it('puts one slash after the branch whether or not the path starts with one', () => {
    expect(sampleSourceUrl({ repositoryUrl, branch: 'dev', subDirectory: 'bi', componentPath: 'hello-world' })).toBe('https://github.com/wso2/integration-samples/tree/dev/bi/hello-world');
    expect(sampleSourceUrl({ repositoryUrl, branch: 'dev', subDirectory: '/bi', componentPath: '/hello-world' })).toBe('https://github.com/wso2/integration-samples/tree/dev/bi/hello-world');
  });
});
