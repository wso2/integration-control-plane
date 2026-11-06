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

import { useState } from 'react';

/**
 * The maximized state of a workflow detail drawer, shaped for `DrawerPanel`'s `expanded` and
 * `onExpandedChange`, so a drawer spreads it: `<DrawerPanel {...useOpenMaximized(id)} ...>`.
 * Detail views open maximized over the page. A person may restore one to a side panel
 * for the item in front of them; closing forgets that, so the next item opens maximized from its
 * first frame.
 */
export function useOpenMaximized(openId: string | null | undefined): {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
} {
  const [restoredId, setRestoredId] = useState<string | null>(null);
  // Closing forgets the restore, adjusted while rendering so the next open starts maximized.
  if (!openId && restoredId !== null) {
    setRestoredId(null);
  }

  return {
    expanded: !openId || restoredId !== openId,
    // The drawer reports "not expanded" as it closes too; only a person's toggle counts.
    onExpandedChange: (next) => {
      if (openId) {
        setRestoredId(next ? null : openId);
      }
    },
  };
}
