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

import type { SchemaConfigItem } from '../types/configuration';

/** A configurable's saved value as the Configure form holds it: its value, '' for a saved secret, which comes back hidden, or undefined when unset. */
export const savedValue = (c: SchemaConfigItem): string | undefined => c.values?.[0]?.value || (c.isSet ? '' : undefined);
