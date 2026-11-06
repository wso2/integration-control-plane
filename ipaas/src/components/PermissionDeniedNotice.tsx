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

import { Alert, Snackbar } from '@wso2/oxygen-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Scopes } from '../constants/permissions';
import { isPermissionError, refusedScope } from '../utils/apiErrors';

const ANCHOR = { vertical: 'bottom', horizontal: 'right' } as const;

/** What a refused scope stops the role from doing, for the refusals whose screens leave the message to this notice. */
const REFUSED_ACTION: Record<string, string> = {
  [Scopes.ENDPOINT_TEST]: 'create test keys',
  [Scopes.ENDPOINT_UPDATE]: "change an API's security or settings",
  [Scopes.APPLICATION_MANAGE]: 'manage consumer applications',
  [Scopes.ENDPOINT_API_KEY_MANAGE]: 'manage API keys',
};

const refusalText = (error: Error): string => {
  const action = REFUSED_ACTION[refusedScope(error) ?? ''];
  return action ? `Your role can't ${action}.` : `Your role doesn't allow this (${error.message}).`;
};

/** Says so when ipaas-service refuses a change because the user's role lacks a scope, wherever the change was made. */
export default function PermissionDeniedNotice(): JSX.Element {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return;
        const { error } = event.mutation.state;
        if (error instanceof Error && isPermissionError(error)) setMessage(refusalText(error));
      }),
    [queryClient],
  );

  const close = () => setMessage(null);
  return (
    <Snackbar open={message !== null} autoHideDuration={8000} onClose={close} anchorOrigin={ANCHOR}>
      <Alert onClose={close} severity="warning" variant="filled">
        {message}
      </Alert>
    </Snackbar>
  );
}
