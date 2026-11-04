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

/** Roughly the three clamped lines a project or integration header has room for. */
export const DESCRIPTION_MAX_LENGTH = 256;

/** Two breaks, so a description is at most three lines. */
export const DESCRIPTION_MAX_NEWLINES = 2;

/** Breaks past the limit become spaces, so pasted prose keeps its word gaps. */
export function clampDescription(value: string): string {
  let breaks = 0;
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, () => (++breaks > DESCRIPTION_MAX_NEWLINES ? ' ' : '\n'))
    .slice(0, DESCRIPTION_MAX_LENGTH);
}

/** A one-line description: line breaks (and the spaces around them) become one space. */
export function toSingleLineDescription(value: string): string {
  return value.replace(/[^\S\r\n]*(\r\n?|\n)\s*/g, ' ').slice(0, DESCRIPTION_MAX_LENGTH);
}

/** Callers suppress the keystroke rather than let clampDescription rewrite it into a stray space. */
export function isAtNewlineLimit(value: string): boolean {
  return (value.match(/\n/g)?.length ?? 0) >= DESCRIPTION_MAX_NEWLINES;
}
