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

import type { InstanceGraph } from '../model/workflowFlow';

/**
 * Why the structural view can't be drawn, or null when it can.
 *
 * The wording matters: each case is a different fact about the deployment, and saying the wrong one
 * sends someone looking in the wrong place. In particular, "could not be placed" is a statement
 * that drawing the structure would be *wrong* (every step would read as "not reached") rather
 * than merely missing.
 */
export function flowUnavailable(data: InstanceGraph | undefined): string | null {
  if (!data) {
    return 'The workflow’s structure could not be loaded, so this run is shown as its history.';
  }
  if (!data.graph) {
    // Without a descriptor the graph is drawn from the steps that ran, so none means none ran yet.
    return 'No step of this run has executed yet, so there is no flow to draw.';
  }
  if (data.stepIdsAvailable === false) {
    return 'This run could not be placed on the workflow’s structure, so it is shown as its history. Its steps carry no step ids (typically an integration built against an older workflow module).';
  }
  return null;
}
