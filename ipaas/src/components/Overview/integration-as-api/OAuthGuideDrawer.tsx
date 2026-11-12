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

import { Alert, Box, Button, Chip, DrawerPanel, Link, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { ExternalLink } from '@wso2/oxygen-ui-icons-react';
import { useMemo, type JSX } from 'react';
import type { SecurityConfig } from '../../../types/consumers';
import type { EnvironmentIdentityProvider } from '../../../types/environment';
import { apiCallCurl, jwtScopes, tokenRequestCurl } from '../../../utils/apiConsumption';
import { friendlyApiError } from '../../../utils/apiSecurity';
import { tokenHeaderExample } from '../../../utils/jwtSecurity';
import CopyButton from './CopyButton';
import * as styles from './apiConsumption.styles';

interface OAuthGuideDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Display label shown in the header badge. */
  envLabel: string;
  /**
   * Display name of the integration's project. The Identity Platform keeps a copy of each of the organization's
   * projects under the same name, and the client belongs in this one.
   */
  projectName: string | undefined;
  /** What the environment's API enforces; its mode is OAuth (`jwt`). */
  security: SecurityConfig;
  /** The org's identity platform in the environment; absent while it loads or when it can't be read. */
  identityProvider: EnvironmentIdentityProvider | undefined;
  /** The read of `identityProvider`, so the guide tells loading and a failed read from a platform not set up. */
  identityLoading: boolean;
  identityError: unknown;
  onRetryIdentity: () => void;
}

function CodeBlock({ code, label }: { code: string; label: string }): JSX.Element {
  return (
    <Box component="pre" sx={styles.codeBlock}>
      {code}
      <Box sx={styles.codeBlockCopy}>
        <CopyButton value={code} label={label} />
      </Box>
    </Box>
  );
}

function Code({ children }: { children: string }): JSX.Element {
  return (
    <Box component="code" sx={styles.summaryCode}>
      {children}
    </Box>
  );
}

function CopyField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Box>
      <Typography sx={styles.fieldLabel}>{label}</Typography>
      <Box sx={styles.credField}>
        <Typography component="span" sx={styles.credValue}>
          {value}
        </Typography>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </Box>
    </Box>
  );
}

/**
 * Read-only "how do I call this API" reference for an OAuth-secured API: how to create a client in the
 * Identity Platform console and deploy it to the environment, the identity platform's endpoints, and sample
 * requests for a token and a call. A client belongs to an Identity Platform project and reaches an environment
 * only through that project's deployment pipeline, which carries its ID and secret to the first environment
 * alone.
 */
export default function OAuthGuideDrawer({ open, onClose, envLabel, projectName, security, identityProvider, identityLoading, identityError, onRetryIdentity }: OAuthGuideDrawerProps): JSX.Element {
  const jwt = security.jwt;
  const scopes = useMemo(() => jwtScopes(jwt), [jwt]);
  const audiences = jwt?.audiences ?? [];
  const tokenHeader = tokenHeaderExample(jwt);
  const idp = identityProvider?.available ? identityProvider : undefined;
  // The console opens in the project last picked in that browser, or the organization's first one, so the step
  // names the project rather than trusting the one already selected.
  const selectProject = projectName ? (
    <>
      select the <strong>{projectName}</strong> project in the header: the project this integration is in.
    </>
  ) : (
    <>select this integration’s project in the header.</>
  );
  // Scopes are issued only for a token requested for an API (resource server), which is also its audience.
  const resource = scopes.length > 0 ? (audiences[0] ?? '<api-identifier>') : undefined;

  return (
    <DrawerPanel open={open} onClose={onClose}>
      <DrawerPanel.Header>
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ flex: 1, minWidth: 0 }}>
          <DrawerPanel.Title sx={{ flex: '0 1 auto' }}>How to call this API</DrawerPanel.Title>
          <Chip label={envLabel} size="small" color="success" variant="outlined" sx={styles.envChip} />
        </Stack>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>
        <Stack gap={3}>
          <Box>
            <Typography variant="subtitle2" sx={styles.sectionTitle}>
              1. Create an OAuth client
            </Typography>
            <Box component="ol" sx={styles.stepList}>
              <Typography component="li" variant="body2">
                {identityProvider?.consoleUrl ? (
                  <>
                    Open the{' '}
                    <Link href={identityProvider.consoleUrl} target="_blank" rel="noopener noreferrer">
                      Identity Platform console
                    </Link>{' '}
                    and {selectProject}
                  </>
                ) : (
                  <>Open the Identity Platform console and {selectProject}</>
                )}
              </Typography>
              <Typography component="li" variant="body2">
                Go to <strong>Applications</strong>, select <strong>Add application</strong>, and choose <strong>Backend service</strong>.
              </Typography>
              <Typography component="li" variant="body2">
                Copy the client ID and client secret. The secret is shown only once.
              </Typography>
              {scopes.length > 0 ? (
                <Typography component="li" variant="body2">
                  Under <strong>APIs</strong>, give the API
                  {audiences.length > 0 && (
                    <>
                      {' '}
                      <Code>{audiences[0]}</Code>
                    </>
                  )}{' '}
                  the permissions {scopes.join(', ')}. Under <strong>Roles</strong>, give the application a role that holds them: a token carries only the scopes the client is granted through its roles.
                </Typography>
              ) : (
                audiences.length > 0 && (
                  <Typography component="li" variant="body2">
                    On the application’s <strong>Advanced</strong> tab, set <strong>Default audience (aud)</strong> to <Code>{audiences[0]}</Code>: this API refuses tokens meant for any other audience.
                  </Typography>
                )
              )}
            </Box>
            {identityProvider?.consoleUrl && (
              <Button variant="outlined" size="small" component="a" href={identityProvider.consoleUrl} target="_blank" rel="noopener noreferrer" startIcon={<ExternalLink size={14} />} sx={styles.panelAlert}>
                Open Identity Platform
              </Button>
            )}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={styles.sectionTitle}>
              2. Deploy it to {envLabel}
            </Typography>
            <Box component="ol" sx={styles.stepList}>
              <Typography component="li" variant="body2">
                A client takes effect in an environment only once it is deployed there. Under <strong>Project</strong>, open <strong>Deployment pipeline</strong>, deploy the latest version to the first environment, and promote it until it reaches {envLabel}.
              </Typography>
              <Typography component="li" variant="body2">
                Only the first environment receives the client ID and secret. For every later one, set them when the deploy asks for its values, or under that environment’s <strong>Variables &amp; secrets</strong>.
              </Typography>
            </Box>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={styles.sectionTitle}>
              3. Get an access token
            </Typography>
            {identityLoading ? (
              <Skeleton variant="rounded" height={56} sx={styles.dialogAlert} />
            ) : identityError ? (
              <Alert
                severity="warning"
                sx={styles.dialogAlert}
                action={
                  <Button color="inherit" size="small" onClick={onRetryIdentity}>
                    Retry
                  </Button>
                }>
                {friendlyApiError(identityError, 'Could not read this environment’s identity platform.')} The token endpoint below is a placeholder until it can be read.
              </Alert>
            ) : idp ? (
              <Stack gap={1.5}>
                {idp.tokenEndpoint && <CopyField label="Token endpoint" value={idp.tokenEndpoint} />}
                {idp.issuer && <CopyField label="Issuer" value={idp.issuer} />}
                {idp.jwksUrl && <CopyField label="JWKS URL" value={idp.jwksUrl} />}
              </Stack>
            ) : (
              <Alert severity="info" sx={styles.dialogAlert}>
                Your organization’s identity platform isn’t ready in this environment yet. Replace the token endpoint below once it is.
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={styles.panelAlert}>
              Request a token with the client’s credentials:
            </Typography>
            <CodeBlock code={tokenRequestCurl(idp?.tokenEndpoint, scopes, resource)} label="Copy token request" />
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={styles.sectionTitle}>
              4. Call the API
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={styles.dialogAlert}>
              Send the access token in the{' '}
              <Box component="code" sx={styles.summaryCode}>
                {tokenHeader.split(':')[0]}
              </Box>{' '}
              header. Request a new token when it expires.
            </Typography>
            <CodeBlock code={apiCallCurl(security.publicUrl, tokenHeader)} label="Copy API call" />
          </Box>
        </Stack>
      </DrawerPanel.Body>

      <DrawerPanel.Footer>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DrawerPanel.Footer>
    </DrawerPanel>
  );
}
