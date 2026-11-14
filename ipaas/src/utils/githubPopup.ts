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

/**
 * Calls `onGone` once the authorization popup has been closed on two polls in a row, and returns the interval to
 * clear when the popup answers. The callback page posts its result and then closes itself, and the closed window
 * can be seen before the message arrives; one more poll lets the message win, so a finished authorization is not
 * taken for one the user gave up on.
 */
export function pollUntilPopupGone(popup: Window | null, onGone: () => void, intervalMs: number): ReturnType<typeof setInterval> {
  let closedPolls = 0;
  const poll = setInterval(() => {
    closedPolls = popup?.closed ? closedPolls + 1 : 0;
    if (closedPolls < 2) return;
    clearInterval(poll);
    onGone();
  }, intervalMs);
  return poll;
}

/**
 * How an authorization that brought back no code ended, from the `error` GitHub put on the callback URL:
 * `access_denied` is the user clicking Cancel on GitHub's page, anything else a failure.
 */
export function noCodeOutcome(error: string | null | undefined): 'cancelled' | 'failed' {
  return error === 'access_denied' ? 'cancelled' : 'failed';
}
