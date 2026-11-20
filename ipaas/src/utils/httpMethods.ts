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

export interface HttpMethodColors {
  badgeBg: string;
  border: string;
  cardBg: string;
}

export const HTTP_METHOD_COLORS: Record<string, HttpMethodColors> = {
  GET: { badgeBg: '#0095FF', border: '#C1E4FC', cardBg: '#F4FAFF' },
  POST: { badgeBg: '#36B475', border: '#CDF1DF', cardBg: '#F5FFF7' },
  PUT: { badgeBg: '#FF9D52', border: '#FEE6C8', cardBg: '#FFFBF6' },
  DELETE: { badgeBg: '#FE523C', border: 'rgba(248,194,194,0.69)', cardBg: 'rgba(252,237,237,0.5)' },
  PATCH: { badgeBg: '#01CEB5', border: 'rgba(1,206,181,0.28)', cardBg: 'rgba(1,206,181,0.08)' },
  OPTIONS: { badgeBg: '#0566C8', border: 'rgba(5,102,200,0.2)', cardBg: 'rgba(5,102,200,0.07)' },
  HEAD: { badgeBg: '#7B55D5', border: 'rgba(123,85,213,0.18)', cardBg: 'rgba(123,85,213,0.08)' },
  TRACE: { badgeBg: '#785446', border: '#d0d0d0', cardBg: '#f5f5f5' },
};

/**
 * MCP tool tiles: the purple of HEAD, so tools sit in the same family as the API tab's methods
 * without borrowing a status colour (green, orange, red or the info blue).
 */
export const MCP_TOOL_COLORS = { badgeBg: HTTP_METHOD_COLORS.HEAD.badgeBg, badgeText: '#FFFFFF', cardBg: HTTP_METHOD_COLORS.HEAD.cardBg };

export const DEFAULT_HTTP_METHOD_COLORS: HttpMethodColors = {
  badgeBg: '#9e9e9e',
  border: '#e0e0e0',
  cardBg: '#f5f5f5',
};

export function getHttpMethodColors(verb: string): HttpMethodColors {
  return HTTP_METHOD_COLORS[verb.toUpperCase()] ?? DEFAULT_HTTP_METHOD_COLORS;
}
