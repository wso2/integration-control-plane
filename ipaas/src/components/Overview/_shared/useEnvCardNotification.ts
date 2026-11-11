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

import { useCallback, useEffect, useState } from 'react';
import type { EnvCardNotification } from '../../../types/integration';

export interface EnvCardNotificationState {
  /** The notice on show, or null. */
  notification: EnvCardNotification | null;
  /** Shows a notice in place of the one on show. */
  onNotify: (notification: EnvCardNotification) => void;
  /** Closes the notice on show. */
  dismiss: () => void;
}

/**
 * An environment card's transient success or error notice, raised by the card's actions through `onNotify` and shown
 * by `EnvCardNotice`. The Overview and Deploy cards share it, so a notice reads and times out the same on both.
 */
export function useEnvCardNotification(): EnvCardNotificationState {
  const [notification, setNotification] = useState<EnvCardNotification | null>(null);
  useEffect(() => {
    if (!notification) return;
    // A two-line notice needs longer to read; errors sit longer than plain confirmations.
    const timeout = notification.detail ? 10000 : notification.severity === 'error' ? 6000 : 4000;
    const timer = setTimeout(() => setNotification(null), timeout);
    return () => clearTimeout(timer);
  }, [notification]);
  const onNotify = useCallback((n: EnvCardNotification) => setNotification(n), []);
  const dismiss = useCallback(() => setNotification(null), []);
  return { notification, onNotify, dismiss };
}
