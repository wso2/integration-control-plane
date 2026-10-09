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

import { Alert, Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Copy, KeyRound } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import EmptyListing from '../../../../components/EmptyListing';
import { useDataplanes } from '../../../hooks/useAppSecurity';
import { useEnvTemplates } from '../../../../hooks/useDeploymentPipelines';
import { useOrgUuid } from '../../../../hooks/useOrgUuid';

const ENDPOINTS: { label: string; suffix: string }[] = [
  { label: 'Discovery', suffix: 'oauth2/token/.well-known/openid-configuration' },
  { label: 'Authorization', suffix: 'oauth2/authorize' },
  { label: 'Token', suffix: 'oauth2/token' },
  { label: 'JWKS', suffix: 'oauth2/jwks' },
];

function EndpointRow({ label, url }: { label: string; url: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ py: 0.5 }}>
      <Typography variant="body2" sx={{ minWidth: 110, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>
        {url}
      </Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton size="small" aria-label={`Copy ${label} endpoint`} onClick={copy}>
          <Copy size={14} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

export default function StsTab({ orgHandler }: { orgHandler: string }): JSX.Element {
  const orgUuid = useOrgUuid();
  const { data: envTemplates, isLoading: loadingEnvs } = useEnvTemplates(orgHandler);
  const { data: dataplanes, isLoading: loadingDps } = useDataplanes();

  const stsDomain = useMemo(() => (dataplanes ?? []).map((d) => d.stsDefaultDomain).find((d): d is string => !!d), [dataplanes]);

  if (loadingEnvs || loadingDps)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );

  if (!envTemplates?.length) return <EmptyListing icon={<KeyRound size={48} />} title="No environments" description="There are no environments to show security token service endpoints for." />;

  if (!stsDomain || !orgUuid) return <Alert severity="info">Security token service endpoints are unavailable — no data-plane STS domain is configured for this organization.</Alert>;

  return (
    <Stack gap={3}>
      {envTemplates.map((env) => {
        const host = `https://${orgUuid}-${env.dns_prefix}.${stsDomain}`;
        return (
          <Box key={env.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>{env.env_name}</Typography>
            {ENDPOINTS.map((e) => (
              <EndpointRow key={e.suffix} label={e.label} url={`${host}/${e.suffix}`} />
            ))}
          </Box>
        );
      })}
    </Stack>
  );
}
