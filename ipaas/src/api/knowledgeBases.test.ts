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
import { toKnowledgeBase, toKnowledgeBaseDataSource } from './knowledgeBases';

describe('toKnowledgeBase', () => {
  it('fills the fields the BFF omits when empty', () => {
    expect(toKnowledgeBase({ name: 'docs-kb', projectName: 'ai-services', environment: 'production' })).toEqual({
      name: 'docs-kb',
      displayName: 'docs-kb',
      description: '',
      projectName: 'ai-services',
      environment: 'production',
      config: {},
      secretKeys: [],
      status: '',
      serviceUrl: '',
      dataSources: [],
      createdAt: '',
    });
  });

  it('maps data sources, keeping a stopped schedule as none', () => {
    const kb = toKnowledgeBase({
      name: 'docs-kb',
      projectName: 'ai-services',
      environment: 'production',
      dataSources: [{ name: 'docs-s3', displayName: 'Docs S3', config: { DATASOURCE: 'amazons3' }, secretKeys: ['AWS_ACCESS_KEY_ID'], status: 'ACTIVE' }],
    });
    expect(kb.dataSources).toEqual([{ name: 'docs-s3', displayName: 'Docs S3', config: { DATASOURCE: 'amazons3' }, secretKeys: ['AWS_ACCESS_KEY_ID'], cronExpression: '', cronTimezone: '', status: 'ACTIVE', releaseName: '', createdAt: '' }]);
  });
});

describe('toKnowledgeBaseDataSource', () => {
  it('keeps whether a just-created source started its first run', () => {
    expect(toKnowledgeBaseDataSource({ name: 'docs-drive', ingestionStarted: false, ingestionError: 'Run it with Ingest.' })).toMatchObject({ ingestionStarted: false, ingestionError: 'Run it with Ingest.' });
    expect(toKnowledgeBaseDataSource({ name: 'docs-drive' })).not.toHaveProperty('ingestionStarted');
  });
});
