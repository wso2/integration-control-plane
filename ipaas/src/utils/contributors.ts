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

import type { ProjectContributor } from '../types/project';

/** One entry per person, busiest first; the BFF matches emails exactly, so case and stray spaces still split a person. */
export function mergeContributors(contributors: ProjectContributor[]): ProjectContributor[] {
  const byEmail = new Map<string, ProjectContributor>();
  // Authors without an email can't be matched to anyone, so each stays on its own.
  const unmatched: ProjectContributor[] = [];
  for (const c of contributors) {
    const email = (c.email ?? '').trim().toLowerCase();
    if (!email) {
      unmatched.push(c);
      continue;
    }
    const seen = byEmail.get(email);
    if (!seen) {
      byEmail.set(email, { ...c, email });
      continue;
    }
    byEmail.set(email, {
      ...seen,
      displayName: seen.displayName || c.displayName,
      pictureUrl: seen.pictureUrl || c.pictureUrl,
      totalContributions: seen.totalContributions + c.totalContributions,
    });
  }
  return [...byEmail.values(), ...unmatched].sort((a, b) => b.totalContributions - a.totalContributions);
}
