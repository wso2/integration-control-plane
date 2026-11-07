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

import { Alert, AlertTitle, Button } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { McpErrorKind } from '../../types/mcp';

const ERROR_TITLES: Record<McpErrorKind, string> = {
  auth: 'Not authorized (401)',
  blocked: 'Response blocked by the browser',
  redirect: 'Redirect not followed',
  other: 'Could not connect',
};

const ERROR_HINTS: Record<'auth' | 'blocked', string> = {
  auth: 'The test key was rejected — it may have expired or been replaced. Get a new key and connect again.',
  blocked: 'The browser withheld the response, so its status is unknown. Usually a test key the gateway has not activated yet, a CORS policy that excludes this console, or an API no longer routed on the gateway.',
};

interface ConnectionAlertProps {
  error: string | null;
  errorKind: McpErrorKind | null;
  isTokenFetching?: boolean;
  /** Mint a fresh token; offered only for the failures a new key can fix. */
  onGetTestKey?: () => void;
}

/** Names what a failed connect means, since a rejected or withheld response reads the same to the transport. */
export default function ConnectionAlert({ error, errorKind, isTokenFetching, onGetTestKey }: ConnectionAlertProps): JSX.Element | null {
  if (!error) return null;
  const keyMayHelp = errorKind === 'auth' || errorKind === 'blocked';
  return (
    <Alert
      severity={keyMayHelp ? 'warning' : 'error'}
      action={
        keyMayHelp && onGetTestKey ? (
          <Button color="inherit" size="small" onClick={onGetTestKey} disabled={isTokenFetching}>
            New key
          </Button>
        ) : undefined
      }>
      <AlertTitle>{ERROR_TITLES[errorKind ?? 'other']}</AlertTitle>
      {keyMayHelp ? ERROR_HINTS[errorKind] : error}
    </Alert>
  );
}
