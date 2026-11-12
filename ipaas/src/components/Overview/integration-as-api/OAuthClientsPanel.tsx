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

import { Alert, Box, Button, Skeleton, Typography } from '@wso2/oxygen-ui';
import { BookOpen, ExternalLink, UserKey } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useEnvironmentIdentityProvider } from '../../../hooks/useEnvironments';
import type { SecurityConfig } from '../../../types/consumers';
import { friendlyApiError } from '../../../utils/apiSecurity';
import CopyButton from './CopyButton';
import OAuthGuideDrawer from './OAuthGuideDrawer';
import * as styles from './apiConsumption.styles';

interface OAuthClientsPanelProps {
  /** Environment name — the BFF's `environmentName` path segment. */
  envName: string;
  /** Display label of the environment. */
  envLabel: string;
  /** What the environment's API enforces; its mode is OAuth (`jwt`). */
  security: SecurityConfig;
}

/**
 * Cloud-only "OAuth clients" subcard inside the API env card, shown while the API takes OAuth tokens. The
 * environment's gateway trusts tokens from the org's identity platform there, so callers create their own
 * OAuth client in the Identity Platform console and get tokens from its token endpoint: the console points
 * the way rather than issuing credentials itself.
 */
export default function OAuthClientsPanel({ envName, envLabel, security }: OAuthClientsPanelProps): JSX.Element {
  const { data: idp, isLoading, error, refetch } = useEnvironmentIdentityProvider(envName);
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <Box sx={styles.subCard}>
      <Box sx={styles.subCardHeader}>
        <Typography variant="body2" sx={styles.subCardTitle}>
          <UserKey size={16} />
          OAuth clients
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={styles.panelAlert}>
        Callers authenticate with access tokens from your organization’s identity platform in {envLabel}. Create an OAuth client for each caller in the Identity Platform console, then request tokens with the client credentials grant.
      </Typography>

      {isLoading ? (
        <Skeleton variant="rounded" height={36} sx={styles.panelAlert} />
      ) : error ? (
        <Alert
          severity="warning"
          sx={styles.panelAlert}
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }>
          {friendlyApiError(error, 'Could not read this environment’s identity platform.')}
        </Alert>
      ) : idp?.available && idp.tokenEndpoint ? (
        <Box sx={styles.panelAlert}>
          <Typography sx={styles.fieldLabel}>Token endpoint</Typography>
          <Box sx={styles.credField}>
            <Typography component="span" sx={styles.credValue}>
              {idp.tokenEndpoint}
            </Typography>
            <CopyButton value={idp.tokenEndpoint} label="Copy token endpoint" />
          </Box>
        </Box>
      ) : (
        <Alert severity="info" sx={styles.panelAlert}>
          Your organization’s identity platform isn’t ready in this environment yet, so its token endpoint can’t be shown.
        </Alert>
      )}

      <Box sx={styles.oauthActions}>
        {idp?.consoleUrl && (
          <Button variant="contained" size="small" component="a" href={idp.consoleUrl} target="_blank" rel="noopener noreferrer" startIcon={<ExternalLink size={14} />}>
            Create a client in Identity Platform
          </Button>
        )}
        <Button variant="outlined" size="small" startIcon={<BookOpen size={14} />} onClick={() => setGuideOpen(true)}>
          How to call this API
        </Button>
      </Box>

      <OAuthGuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} envLabel={envLabel} security={security} identityProvider={idp} identityLoading={isLoading} identityError={error} onRetryIdentity={() => void refetch()} />
    </Box>
  );
}
