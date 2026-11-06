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

import type { WorkItemTypeFilter } from '../routing/useWorkflowRoutes';
import { sortByStartTimeDesc } from '../shared/sortByStartTime';
import type { WorkItem } from './workItem';

/**
 * Merges the two sources behind the Human Tasks queue.
 *
 * The engine exposes `/human-tasks` and `/review-activities` as separate resources with their own
 * cursors; there is no unified work-items route (the operations layer has `workItems.list`, but no
 * REST route reaches it). So the two are paged independently and interleaved here by start time.
 *
 * The known consequence, which is worth stating rather than hiding: because each source pages
 * separately, "Load more" can return fewer rows than a page size, and the combined ordering is only
 * correct within what has actually been loaded. A true unified cursor would need the engine's help.
 */

/** Newest first; anything with an unreadable start time sorts last. */
export function mergeWorkItems(tasks: WorkItem[], reviews: WorkItem[]): WorkItem[] {
  return sortByStartTimeDesc([...tasks, ...reviews]);
}

export function filterWorkItems(items: WorkItem[], { type, search, workflowType = '' }: { type: WorkItemTypeFilter; search: string; workflowType?: string }): WorkItem[] {
  const query = search.trim().toLowerCase();
  return items.filter((item) => {
    if (type && item.kind !== type) {
      return false;
    }
    // Reviews cannot be listed by definition, so they are narrowed here. A runtime before workflow
    // 0.10 reports no parent type; its items are kept rather than dropped, as the overview counts them.
    if (workflowType && item.parentWorkflowType && item.parentWorkflowType !== workflowType) {
      return false;
    }
    if (!query) {
      return true;
    }
    return item.title.toLowerCase().includes(query) || item.name.toLowerCase().includes(query) || item.parentWorkflowId.toLowerCase().includes(query) || item.taskId.toLowerCase().includes(query);
  });
}
