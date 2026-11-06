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

// TODO: implement using cloud APIs
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] copilot.${name}: not implemented`));

export const getAiCopilotAnswer = (_copilotUrl: string, _nlQuery: string, _abortSignal: AbortSignal, _correlationId: string, _chatContext?: Record<string, unknown>): Promise<Response> => ni('getAiCopilotAnswer');
export const provideCopilotFeedback = (_orgId: string, _feedback: boolean, _correlationId: string): Promise<void> => ni('provideCopilotFeedback');
export const getCopilotDataCollectionPermission = (_orgId: string): Promise<{ status: string }> => ni('getCopilotDataCollectionPermission');
export const updateCopilotDataCollectionPermission = (_orgId: string, _disabled: boolean): Promise<void> => ni('updateCopilotDataCollectionPermission');
