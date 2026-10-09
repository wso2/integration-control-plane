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

import { blankAutomation, DEFAULT_CHUNKING } from '../../../constants/ragIngestion';
import type { AutomationConfig, ChunkingConfig, DatasourceConfig, EmbeddingConfig, RagIngestionForm, VectorStoreConfig } from '../../../types/ragIngestion';

export const initialRagForm: RagIngestionForm = {
  vectorStore: null,
  embedding: null,
  chunking: DEFAULT_CHUNKING,
  automation: blankAutomation(),
  datasource: null,
};

/** Each action replaces one section of the form with a fully-formed value. */
export type RagFormAction =
  | { type: 'vectorStore'; value: VectorStoreConfig | null }
  | { type: 'embedding'; value: EmbeddingConfig | null }
  | { type: 'chunking'; value: ChunkingConfig }
  | { type: 'automation'; value: AutomationConfig }
  | { type: 'datasource'; value: DatasourceConfig | null };

export function ragFormReducer(state: RagIngestionForm, action: RagFormAction): RagIngestionForm {
  switch (action.type) {
    case 'vectorStore':
      return { ...state, vectorStore: action.value };
    case 'embedding':
      return { ...state, embedding: action.value };
    case 'chunking':
      return { ...state, chunking: action.value };
    case 'automation':
      return { ...state, automation: action.value };
    case 'datasource':
      return { ...state, datasource: action.value };
  }
}
