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

import { useEffect, useState, type JSX } from 'react';
import { Alert, Box } from '@wso2/oxygen-ui';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../auth';

function friendlyError(err: unknown): string {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (message.includes('failed to fetch') || err instanceof TypeError) return 'Unable to connect to the server. Please check your connection and try again.';
  return 'Sign-in failed. Please try again.';
}

/**
 * Sign-in (and sign-up) is hosted by Thunder, the IdP, on its own branded page, so this
 * route renders no sign-in UI: it hands off to Thunder's authorize endpoint (no fidp,
 * so Thunder shows its choose-auth screen) and shows a loader until the redirect.
 */
export default function Login(): JSX.Element {
  const { loginWithOIDC } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loginWithOIDC().catch((err) => setError(friendlyError(err)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  return <PageLoader viewport label="Redirecting to sign in…" />;
}
