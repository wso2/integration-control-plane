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

import type { ContextEngine, ContextIntegration } from '../types/contextEngine';

/** One choice in the logs tab's source picker: the engine itself or one of its integrations. */
export interface EngineLogSource {
  component: string;
  label: string;
}

/** The engine first, then its integrations by name. */
export function engineLogSources(engine: Pick<ContextEngine, 'component'>, integrations: Pick<ContextIntegration, 'name' | 'component'>[]): EngineLogSource[] {
  const byName = [...integrations].sort((a, b) => a.name.localeCompare(b.name));
  return [{ component: engine.component, label: 'Context engine' }, ...byName.map((i) => ({ component: i.component, label: i.name }))];
}
