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

/** What one plan allows a scheduled component. 0 is no limit. */
export interface ScheduleLimits {
  minRunIntervalMinutes: number;
  maxTimeoutSeconds: number;
  allowOverlap: boolean;
}

/** What each plan allows one kind of scheduled component, and what a new schedule of it starts with. */
export interface SchedulePolicy {
  free: ScheduleLimits;
  paid: ScheduleLimits;
  defaultCron: string;
  defaultTimeoutSeconds: number;
  defaultConcurrencyPolicy: string;
}

/** What a scheduled component runs. A knowledge base ingestion has its own policy. */
export type ScheduleKind = 'automation' | 'ingestion';
