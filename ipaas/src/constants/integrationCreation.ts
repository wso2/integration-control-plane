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

export interface CreationStep {
  progress: number;
  text: string;
}

export const CREATION_STEPS: CreationStep[] = [
  { progress: 10, text: 'Starting integration creation…' },
  { progress: 35, text: 'Creating integration component…' },
  { progress: 65, text: 'Configuring repository settings…' },
  { progress: 85, text: 'Finalizing setup…' },
];

export const VOICE_AGENT_CREATION_STEPS: CreationStep[] = [
  { progress: 10, text: 'Creating voice agent…' },
  { progress: 35, text: 'Storing your provider keys…' },
  { progress: 65, text: 'Deploying voice agent…' },
  { progress: 85, text: 'Finalizing setup…' },
];

export const CREATION_STEP_INTERVAL = 1200; // milliseconds between each step
