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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Wrap JSON tokens (keys, strings, numbers, booleans, null) in classed spans for
 * theme-driven colouring. The source is escaped first, so the returned HTML
 * contains only our own `<span>` tags (safe for `dangerouslySetInnerHTML`).
 */
export function highlightJson(json: string): string {
  return escapeHtml(json).replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (match) => {
    let cls = 'tok-num';
    if (/^"/.test(match)) cls = /:$/.test(match) ? 'tok-key' : 'tok-str';
    else if (match === 'true' || match === 'false') cls = 'tok-bool';
    else if (match === 'null') cls = 'tok-null';
    return `<span class="${cls}">${match}</span>`;
  });
}

/** Parse a JSON string for display: `null` when empty, the parsed value, or the raw string if it isn't valid JSON. */
export function parseJsonSafe(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
