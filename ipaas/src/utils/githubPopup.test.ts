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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noCodeOutcome, pollUntilPopupGone } from './githubPopup';

describe('pollUntilPopupGone', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits one more poll after the popup closes, so its last message can still arrive', () => {
    const popup = { closed: false } as Window;
    const gone = vi.fn();
    pollUntilPopupGone(popup, gone, 500);
    vi.advanceTimersByTime(500);
    (popup as { closed: boolean }).closed = true;
    vi.advanceTimersByTime(500);
    expect(gone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(gone).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(gone).toHaveBeenCalledTimes(1);
  });

  it('never fires once the interval is cleared, as a message does', () => {
    const popup = { closed: true } as Window;
    const gone = vi.fn();
    const poll = pollUntilPopupGone(popup, gone, 500);
    vi.advanceTimersByTime(500);
    clearInterval(poll);
    vi.advanceTimersByTime(5000);
    expect(gone).not.toHaveBeenCalled();
  });

  it('never fires for a popup the browser blocked', () => {
    const gone = vi.fn();
    const poll = pollUntilPopupGone(null, gone, 500);
    vi.advanceTimersByTime(5000);
    clearInterval(poll);
    expect(gone).not.toHaveBeenCalled();
  });
});

describe('noCodeOutcome', () => {
  it('is cancelled when the user declined on GitHub', () => {
    expect(noCodeOutcome('access_denied')).toBe('cancelled');
  });

  it('is failed for any other reason, or none', () => {
    expect(noCodeOutcome('redirect_uri_mismatch')).toBe('failed');
    expect(noCodeOutcome(null)).toBe('failed');
    expect(noCodeOutcome(undefined)).toBe('failed');
  });
});
