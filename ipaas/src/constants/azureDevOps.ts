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

export const AZURE_DEVOPS_AUTH = {
  AUTHORIZE_URL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  SCOPE: '499b84ac-1321-427f-aa17-267ca6975798/.default offline_access',
  POPUP_DIMENSIONS: 'width=800,height=650',
  POPUP_POLL_INTERVAL_MS: 500,
  CALLBACK_DELIVERY_GRACE_MS: 1000,
  BROADCAST_CHANNEL: 'AZURE_DEVOPS_EXTERNAL_OAUTH',
} as const;
