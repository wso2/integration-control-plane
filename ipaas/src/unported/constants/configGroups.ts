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

/** Max size for a file-typed config value (mirrors Devant's 20 KB cap). */
export const CONFIG_FILE_MAX_KB = 20;

/** Config key: starts with a letter/underscore, then letters/digits/underscores. */
export const CONFIG_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const CONFIG_KEY_ERROR = 'Key must start with a letter or underscore and contain only letters, digits, and underscores.';

/** Selectable key types in the create/edit wizard (secret is a separate per-key toggle). */
export const KEY_TYPE_OPTIONS: { value: 'text' | 'file'; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'file', label: 'File' },
];
