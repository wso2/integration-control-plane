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

import { Alert, Box, Button, Chip, Collapse, IconButton, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronUp, ShieldCheck } from '@wso2/oxygen-ui-icons-react';
import { Fragment, useState, type JSX, type ReactNode } from 'react';
import { DEFAULT_API_KEY_HEADER, DEFAULT_JWT_KEY_MANAGER, SECURITY_MODE_LABEL } from '../../../constants/apiConsumption';
import { useEndpointSecurity } from '../../../hooks/useConsumers';
import type { EndpointRef, SecurityConfig } from '../../../types/consumers';
import { endpointLoadNotice, readOnlyApiSettingsNotice } from '../../../utils/apiSecurity';
import { forwardedTokenExample, scopeRequirementText, tokenHeaderExample } from '../../../utils/jwtSecurity';
import * as styles from './apiConsumption.styles';

interface SecuritySummaryProps {
  /** The environment's API for the selected endpoint. */
  endpointRef: EndpointRef;
}

const Code = ({ children }: { children: ReactNode }) => (
  <Typography variant="body2" component="span" sx={styles.summaryCode}>
    {children}
  </Typography>
);

/** Label/value rows for what this environment's API enforces. */
function summaryRows(security: SecurityConfig): Array<[string, ReactNode]> {
  if (security.mode === 'api-key') return [['API key header', <Code key="h">{security.apiKey?.header || DEFAULT_API_KEY_HEADER}</Code>]];
  if (security.mode !== 'jwt') return [['Access', 'Anyone who can reach the endpoint can call it.']];

  const jwt = security.jwt;
  const forwarded = forwardedTokenExample(jwt);
  // Operations in the API's own order; the scopes map has no order of its own.
  const scoped = (security.operations?.map((op) => op.key) ?? Object.keys(jwt?.operations ?? {})).filter((key) => scopeRequirementText(jwt?.operations?.[key]));
  return [
    ['Token header', <Code key="t">{tokenHeaderExample(jwt)}</Code>],
    ['Key manager', (jwt?.issuers?.length ? jwt.issuers : [DEFAULT_JWT_KEY_MANAGER]).join(', ')],
    ['Audiences', jwt?.audiences?.length ? jwt.audiences.join(', ') : 'Any'],
    ['Backend receives', forwarded ? <Code key="f">{forwarded}</Code> : 'No token'],
    [
      'Scopes',
      scoped.length ? (
        <Stack key="s" gap={0.5}>
          {scoped.map((key) => (
            <Box key={key}>
              <Code>{key}</Code>
              <Typography variant="body2" component="span" color="text.secondary">
                {' '}
                {scopeRequirementText(jwt?.operations?.[key])}
              </Typography>
            </Box>
          ))}
        </Stack>
      ) : (
        'None required'
      ),
    ],
  ];
}

/**
 * Cloud-only "Security" subcard inside the API env card: what this environment's API enforces for
 * the selected endpoint, collapsed to its scheme until opened. Read-only — security is configured once, above the cards, in the
 * pipeline's entry environment, and reaches the others by promotion, so each environment can
 * differ until it is promoted to.
 */
export default function SecuritySummary({ endpointRef }: SecuritySummaryProps): JSX.Element {
  const { data: security, isLoading, error, refetch } = useEndpointSecurity(endpointRef);
  // Collapsed by default: the mode chip in the header is the summary, the rows are the detail.
  const [expanded, setExpanded] = useState(false);

  const title = (chip: ReactNode) => (
    <Typography variant="body2" sx={styles.subCardTitle}>
      <ShieldCheck size={16} />
      Security
      {chip}
    </Typography>
  );

  if (isLoading) {
    return (
      <Box sx={styles.subCard}>
        <Box sx={styles.subCardHeader}>{title(<Skeleton variant="rounded" width={56} height={16} />)}</Box>
      </Box>
    );
  }

  if (error || !security) {
    const notice = endpointLoadNotice(error, {
      notExposed: 'This endpoint isn’t exposed as an API in this environment yet.',
      unavailable: 'API security isn’t available in this environment.',
      readFailed: 'Could not read this environment’s security configuration.',
    });
    return (
      <Box sx={styles.subCard}>
        <Box sx={styles.subCardHeader}>{title(null)}</Box>
        <Alert
          severity={notice?.severity ?? 'warning'}
          sx={styles.panelAlert}
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }>
          {notice?.text ?? 'Could not read this environment’s security configuration.'}
        </Alert>
      </Box>
    );
  }

  const readOnlyNotice = readOnlyApiSettingsNotice(security);
  const chip = security.stateUnknown ? (
    <Chip label="Unknown" size="small" variant="outlined" sx={styles.consumerStatusChip} />
  ) : (
    <Chip label={SECURITY_MODE_LABEL[security.mode]} size="small" variant="outlined" color={security.mode === 'none' ? 'warning' : 'success'} sx={styles.consumerStatusChip} />
  );
  const toggleLabel = expanded ? 'Hide security settings' : 'Show security settings';
  return (
    <Box sx={styles.subCard}>
      <Box sx={styles.collapsibleHeader} onClick={() => setExpanded((prev) => !prev)}>
        {title(chip)}
        <Tooltip title={toggleLabel}>
          <IconButton size="small" aria-label={toggleLabel} aria-expanded={expanded}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </IconButton>
        </Tooltip>
      </Box>
      <Collapse in={expanded} unmountOnExit>
        {!security.stateUnknown && (
          <Box sx={styles.summaryGrid}>
            {summaryRows(security).map(([label, value]) => (
              <Fragment key={label}>
                <Typography variant="body2" sx={styles.summaryLabel}>
                  {label}
                </Typography>
                <Typography variant="body2" component="div">
                  {value}
                </Typography>
              </Fragment>
            ))}
          </Box>
        )}
        {readOnlyNotice && (
          <Typography variant="caption" color="text.secondary" component="p" sx={styles.panelAlert}>
            {readOnlyNotice}
          </Typography>
        )}
      </Collapse>
    </Box>
  );
}
