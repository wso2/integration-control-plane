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

import type { CloudEditorStep } from '../types/cloudEditor';

/** Ordered deployment steps shown in the wheel. A `PodPhase` value is also a step key. */
export const CLOUD_EDITOR_STEPS: CloudEditorStep[] = [
  { key: 'initializing', label: 'Getting things ready' },
  { key: 'creating', label: 'Setting up your editor' },
  { key: 'scheduling', label: 'Allocating resources' },
  { key: 'starting', label: 'Starting your editor' },
  { key: 'opening', label: 'Opening editor' },
];

/** Height of one wheel row in px. */
export const CLOUD_EDITOR_WHEEL_ROW_HEIGHT = 40;
/** Readiness poll + keep-alive ping interval (ms). */
export const CLOUD_EDITOR_POLL_MS = 3_000;
/** Give up waiting for the editor to report ready after this (ms), once its address is known. */
export const CLOUD_EDITOR_READY_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Message of the error thrown when the poll budget expires. Shared so
 * CloudEditorDeployment can branch on it without repeating the literal.
 */
export const CLOUD_EDITOR_TIMEOUT_MESSAGE = 'Timed out waiting for the Cloud Editor to become ready';
