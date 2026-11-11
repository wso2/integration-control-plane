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

import { Alert, Box, Button, Chip, DrawerPanel, Link, Stack, Typography } from '@wso2/oxygen-ui';
import { ExternalLink } from '@wso2/oxygen-ui-icons-react';
import { useMemo, type JSX } from 'react';
import type { SecurityConfig } from '../../../types/consumers';
import type { EnvironmentIdentityProvider } from '../../../types/environment';
import { apiCallCurl, jwtScopes, tokenRequestCurl } from '../../../utils/apiConsumption';
import { tokenHeaderExample } from '../../../utils/jwtSecurity';
import CopyButton from './CopyButton';
import * as styles from './apiConsumption.styles';

interface OAuthGuideDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Display label shown in the header badge. */
  envLabel: string;
  /** What the environment's API enforces; its mode is OAuth (`jwt`). */
  security: SecurityConfig;
  /** The org's identity platform in the environment; absent while it loads or when it can't be read. */
  identityProvider: EnvironmentIdentityProvider | undefined;
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
 * Identity Platform console, the identity platform's endpoints, and sample requests for a token and a call.
 */
export default function OAuthGuideDrawer({ open, onClose, envLabel, security, identityProvider }: OAuthGuideDrawerProps): JSX.Element {
  const jwt = security.jwt;
  const scopes = useMemo(() => jwtScopes(jwt), [jwt]);
  const audiences = jwt?.audiences ?? [];
  const tokenHeader = tokenHeaderExample(jwt);
  const idp = identityProvider?.available ? identityProvider : undefined;

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
                    and select the {envLabel} environment.
                  </>
                ) : (
                  <>Open the Identity Platform console and select the {envLabel} environment.</>
                )}
              </Typography>
              <Typography component="li" variant="body2">
                Create a machine-to-machine application that uses the client credentials grant.
              </Typography>
              {audiences.length > 0 && (
                <Typography component="li" variant="body2">
                  Set its access token audience to {audiences.length === 1 ? '' : 'one of '}
                  {audiences.map((aud, i) => (
                    <Box component="code" key={aud} sx={styles.summaryCode}>
                      {i > 0 ? ', ' : ''}
                      {aud}
                    </Box>
                  ))}
                  : this API refuses tokens meant for any other audience.
                </Typography>
              )}
              {scopes.length > 0 && (
                <Typography component="li" variant="body2">
                  Allow it the scopes the operations it calls require: {scopes.join(', ')}.
                </Typography>
              )}
              <Typography component="li" variant="body2">
                Copy the client ID and secret into the client that calls this API.
              </Typography>
            </Box>
            {identityProvider?.consoleUrl && (
              <Button variant="outlined" size="small" component="a" href={identityProvider.consoleUrl} target="_blank" rel="noopener noreferrer" startIcon={<ExternalLink size={14} />} sx={styles.panelAlert}>
                Open Identity Platform
              </Button>
            )}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={styles.sectionTitle}>
              2. Get an access token
            </Typography>
            {idp ? (
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
            <CodeBlock code={tokenRequestCurl(idp?.tokenEndpoint, scopes)} label="Copy token request" />
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={styles.sectionTitle}>
              3. Call the API
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={styles.dialogAlert}>
              Send the access token in the <Box component="code" sx={styles.summaryCode}>{tokenHeader.split(':')[0]}</Box> header. Request a new token when it expires.
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
