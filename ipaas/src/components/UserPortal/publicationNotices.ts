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

import type { EnvCardNotification } from '../../types/integration';
import type { UserPortalRefusal } from '../../types/userPortal';
import { refusalText, rejectedScopesText } from '../../utils/userPortal';

/**
 * The notices a publish or an unpublish in `envName` ends with, reported through `onNotify`, as the env cards and the
 * workflow pages word them. `background` is for `useBackgroundPublishOutcome`.
 */
export function publicationNotices(envName: string, onNotify: (notification: EnvCardNotification) => void) {
  const published = (rejectedScopes: string[]) =>
    onNotify({
      text: `Published to the User Portal in ${envName}.`,
      severity: 'success',
      // Scopes the endpoints require that the portal's users' tokens can't carry.
      detail: rejectedScopes.length > 0 ? rejectedScopesText(rejectedScopes) : undefined,
    });
  // Reported as a publish is: at once, or when the work after the response ends.
  const unpublished = () => onNotify({ text: `Unpublished from the User Portal in ${envName}.`, severity: 'success' });
  return {
    published,
    unpublished,
    background: {
      onPublished: published,
      onFailed: (failure: UserPortalRefusal) => onNotify({ text: `Could not publish to the User Portal in ${envName}.`, severity: 'error', detail: refusalText(failure, envName) }),
      onUnpublished: unpublished,
      onUnpublishFailed: (failure: UserPortalRefusal) => onNotify({ text: `Could not finish unpublishing from the User Portal in ${envName}.`, severity: 'error', detail: refusalText(failure, envName) }),
    },
  };
}
