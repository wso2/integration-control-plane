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

import type { ApiState } from '../../types/lifecycle';

export const ACTION_PENDING_LABEL: Record<string, string> = {
  Deprecate: 'Deprecating…',
  Retire: 'Retiring…',
};

export const ACTION_LABEL: Record<string, string> = {
  Publish: 'Publish',
  'Re-Publish': 'Re-Publish',
  'Deploy as a Prototype': 'Pre-release',
  'Demote to Created': 'Demote to Created',
  Deprecate: 'Deprecate',
  Retire: 'Retire',
};

export const CONFIRM_ACTIONS = new Set(['Publish', 'Re-Publish', 'Deprecate', 'Retire']);
export const PUBLISH_ACTIONS = new Set(['Publish', 'Re-Publish']);
export const HIDDEN_ACTIONS = new Set(['Block']);

export const EVENT_TARGET: Record<string, ApiState> = {
  Publish: 'Published',
  'Re-Publish': 'Published',
  'Deploy as a Prototype': 'Prototyped',
  'Demote to Created': 'Created',
  Deprecate: 'Deprecated',
  Retire: 'Retired',
};

export const SUCCESS_TEXT: Record<string, string> = {
  Publish: 'API published successfully.',
  'Re-Publish': 'API re-published successfully.',
  'Deploy as a Prototype': 'API pre-released successfully.',
  'Demote to Created': 'API demoted to Created.',
  Deprecate: 'API deprecated successfully.',
  Retire: 'API retired successfully.',
};

export const CONFIRM_TEXT: Record<string, string> = {
  Publish: 'Publish your API to the Developer Portal with the specified display name, or edit the name here before publishing.',
  'Re-Publish': 'Re-publish your API to the Developer Portal with the specified display name, or edit the name here before re-publishing.',
  Deprecate: 'Are you sure you want to deprecate the API? Existing subscribers can still access it but new subscriptions will be blocked. This action cannot be undone.',
  Retire: 'Are you sure you want to retire the API? All existing subscriptions will be revoked and consumers will lose access. This action cannot be undone.',
};

export const isDestructiveAction = (action: string): boolean => action === 'Deprecate' || action === 'Retire';
