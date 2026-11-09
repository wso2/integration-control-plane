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
import { VOICE_AGENT_COMPONENT_TYPE } from '../constants/voiceAgent';
import { identifyIntegration } from './identifyIntegration';

describe('identifyIntegration — RAG types', () => {
  it('maps the ingestion cronjob subtype to rag-ingestion', () => {
    expect(identifyIntegration('byoiCronjob', 'rag-ingestion').type).toBe('rag-ingestion');
  });

  it('maps the RAG retrieval + API service subtypes to integration-as-api', () => {
    expect(identifyIntegration('byoiService', 'rag-retrieval-service').type).toBe('integration-as-api');
    expect(identifyIntegration('byoiService', 'rag-service').type).toBe('integration-as-api');
  });

  it('maps a knowledge base data source to rag-ingestion and its service to integration-as-api', () => {
    expect(identifyIntegration('automation', 'kb-ingestion').type).toBe('rag-ingestion');
    expect(identifyIntegration('service', 'knowledge-base').type).toBe('integration-as-api');
  });

  it('leaves a plain byoi service (no RAG subtype) unsupported', () => {
    expect(identifyIntegration('byoiService', null).type).toBe('unsupported');
  });
});

describe('identifyIntegration — existing types still resolve', () => {
  it('resolves core displayTypes', () => {
    expect(identifyIntegration('ballerinaService', null).type).toBe('integration-as-api');
    expect(identifyIntegration('scheduledTask', null).type).toBe('automation');
    expect(identifyIntegration('ballerinaService', 'tailscale').type).toBe('tailscale-vpn');
  });
});

describe('identifyIntegration — workflow', () => {
  it('resolves the workflow display type to a Ballerina workflow', () => {
    expect(identifyIntegration('ballerinaWorkflow', null)).toMatchObject({ type: 'workflow', runtime: 'ballerina' });
  });
});

describe('identifyIntegration — voice agent', () => {
  it('resolves the voice agent display type to a voice agent', () => {
    expect(identifyIntegration(VOICE_AGENT_COMPONENT_TYPE, null)).toMatchObject({ type: 'voice-agent', runtime: 'unknown' });
  });
});
