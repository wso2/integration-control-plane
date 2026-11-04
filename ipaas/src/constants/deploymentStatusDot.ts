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
 * How a `deploymentStatusV2` value reads in the UI — label and theme dot colour.
 *
 * Shared by the two surfaces that draw a deployment dot: the Overview env-card
 * status (label + dot) and the environment picker (dot only). What each does with
 * an unrecognised status differs and stays with the component.
 */
export const DEPLOYMENT_STATUS_DOT: Record<string, { label: string; dotColor: string }> = {
  ACTIVE: { label: 'Active', dotColor: 'success.main' },
  ERROR: { label: 'Error', dotColor: 'error.main' },
  IN_PROGRESS: { label: 'In progress', dotColor: 'warning.main' },
  SUSPENDED: { label: 'Suspended', dotColor: 'text.disabled' },
  NOT_DEPLOYED: { label: 'Not deployed', dotColor: 'text.disabled' },
};
