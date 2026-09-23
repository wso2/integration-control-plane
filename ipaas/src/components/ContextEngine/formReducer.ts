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

import type { ContextEngineForm, ContextSourceConfig, LlmConfig } from '../../types/contextEngine';
import type { EmbeddingConfig } from '../../types/ragIngestion';

export const initialContextEngineForm: ContextEngineForm = {
  sources: [],
  roles: [],
  embedding: null,
  llm: null,
  name: '',
  description: '',
};

export type ContextEngineFormAction =
  | { type: 'addSource'; source: ContextSourceConfig }
  | { type: 'updateSource'; index: number; source: ContextSourceConfig }
  | { type: 'removeSource'; index: number }
  | { type: 'roles'; value: string[] }
  | { type: 'embedding'; value: EmbeddingConfig | null }
  | { type: 'llm'; value: LlmConfig | null }
  | { type: 'name'; value: string }
  | { type: 'description'; value: string };

export function contextEngineFormReducer(state: ContextEngineForm, action: ContextEngineFormAction): ContextEngineForm {
  switch (action.type) {
    case 'addSource':
      return { ...state, sources: [...state.sources, action.source] };
    case 'updateSource':
      return { ...state, sources: state.sources.map((s, i) => (i === action.index ? action.source : s)) };
    case 'removeSource':
      return { ...state, sources: state.sources.filter((_, i) => i !== action.index) };
    case 'roles':
      return { ...state, roles: action.value };
    case 'embedding':
      return { ...state, embedding: action.value };
    case 'llm':
      return { ...state, llm: action.value };
    case 'name':
      return { ...state, name: action.value };
    case 'description':
      return { ...state, description: action.value };
  }
}
