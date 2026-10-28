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

import type { Sample } from '../types/samples';

export const PAGE_SIZE = 9;

// Display names repeat across technologies (Hello World Service is both Ballerina and MI).
export const sampleKey = (sample: Sample): string => `${sample.buildPack}:${sample.componentPath}`;

export const DEFAULT_PREBUILT_INTEGRATIONS_URL = 'https://raw.githubusercontent.com/wso2/integration-samples/main/.metadata/prebuilt-integrations.json';
