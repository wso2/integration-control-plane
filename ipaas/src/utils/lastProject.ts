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

import type { Project } from '../types/project';
import { shared } from './storage';

// The name the WSO2 Cloud platforms agreed on. They share this origin, so the project opened in one
// is the one the next platform opens.
const KEY = 'lastOpenedProject';

/** The handle of the project last opened in this browser. */
export function readLastProject(): string | undefined {
  try {
    return shared.get(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Remembers the project open at the project or integration level, and forgets it at the
 * organization level (`project` undefined), where the next platform then opens too.
 */
export function rememberLastProject(project: string | undefined): void {
  try {
    if (project) shared.set(KEY, project);
    else shared.remove(KEY);
  } catch {
    // A convenience only: without it the console opens on the organization.
  }
}

/**
 * The last opened project, when it is one of `projects` (the session org's) and not being deleted. The
 * stored handle names no org, so one opened in another org or another console is never landed on here.
 */
export function lastProjectIn(projects: Pick<Project, 'handler' | 'deleting'>[]): string | undefined {
  const last = readLastProject();
  return last && projects.some((p) => p.handler === last && !p.deleting) ? last : undefined;
}
