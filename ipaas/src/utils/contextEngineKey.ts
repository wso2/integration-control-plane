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
 * An engine's key in this console. The BFF names an engine by its name within an environment,
 * and neither may hold a slash, so the pair fits one string for ids, query keys and storage keys.
 */
export function contextEngineKey(environment: string, handle: string): string {
  return `${environment}/${handle}`;
}

export function parseContextEngineKey(key: string): { environment: string; handle: string } {
  const at = key.indexOf('/');
  if (at <= 0 || at === key.length - 1) throw new Error(`Not a context engine key: "${key}"`);
  return { environment: key.slice(0, at), handle: key.slice(at + 1) };
}
