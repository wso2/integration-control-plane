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

import { Button, Chip, IconButton, Stack, Tooltip } from '@wso2/oxygen-ui';
import { CodeXml, Recycle, ShieldCheck } from '@wso2/oxygen-ui-icons-react';
import { useState, type ReactNode } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { useApimApi } from '../../../hooks/useApim';
import { getDevPortalApiUrl } from '../../../config/runtimeConfig';
import { IS_CLOUD } from '../../../features';
import type { OverviewHeaderActionsProps } from '../../../types/integration';
import SecurityDrawer from '../../SecurityDrawer';
import ConfigureActionRow from './ConfigureActionRow';
import { trackEvent } from '../../../utils/tracking';

/**
 * Props of the default block = the module-slot props + an `extra` slot. A type
 * that wants the standard actions plus something type-specific (e.g.
 * integration-as-api + Generate MCP) renders this with `extra` filled.
 */
interface DefaultOverviewHeaderActionsProps extends OverviewHeaderActionsProps {
  /**
   * Type-specific actions appended after Developer Portal (same row). e.g.
   * integration-as-api plugs in its Generate MCP button here; other API-backed
   * types (ai-agent, mcp-server) leave it empty.
   */
  extra?: ReactNode;
  /**
   * Additional "Configure …" rows rendered right after Configure Security, in
   * the same style (use `ConfigureActionRow`). e.g. MCP adds Configure Policies
   * alongside Configure Security.
   */
  extraConfigureRows?: ReactNode;
}

const LIFECYCLE_LABEL: Record<string, string> = {
  CREATED: 'Created',
  PUBLISHED: 'Published',
  PROTOTYPED: 'Prototyped',
  DEPRECATED: 'Deprecated',
  BLOCKED: 'Blocked',
};

/**
 * Shared Overview-header API actions — Configure Security, Lifecycle Status,
 * and Developer Portal — rendered by the generic `HeaderShell` for every
 * API-backed integration type. It owns its own APIM data + the SecurityDrawer.
 * Type-specific actions are appended via the `extra` slot so the shell and this
 * shared block stay type-agnostic (no `isAiAgent`/`isMcp` branching).
 */
export default function OverviewHeaderActions({ component, apimId, orgHandler, projectHandler, extra, extraConfigureRows }: DefaultOverviewHeaderActionsProps): ReactNode {
  const componentHandler = component.handler;
  const componentId = component.id;
  const versionId = component.deploymentTracks?.[0]?.id;
  const navigate = useAppNavigate();
  const [securityDrawerOpen, setSecurityDrawerOpen] = useState(false);
  const { data: apimApi } = useApimApi(apimId);
  const lifecycleStatus = apimApi?.lifeCycleStatus ?? null;
  const isPublished = lifecycleStatus === 'PUBLISHED' || lifecycleStatus === 'PROTOTYPED';
  const devPortalUrl = apimApi ? getDevPortalApiUrl(orgHandler, apimApi.name, apimApi.version) : null;
  const lifecycleColor: 'success' | 'error' | 'warning' | 'default' = lifecycleStatus === 'PUBLISHED' ? 'success' : lifecycleStatus === 'DEPRECATED' || lifecycleStatus === 'BLOCKED' ? 'error' : lifecycleStatus === 'PROTOTYPED' ? 'warning' : 'default';

  return (
    <>
      {/* alignItems switches to left-aligned under the same narrow-container threshold as the
          HeaderShell block this renders inside (see HeaderShell's NARROW_HEADER_QUERY) — this is a
          separate component, but container queries key off DOM ancestry, not component boundaries. */}
      <Stack gap={1} alignItems="flex-end" sx={{ '@container (max-width: 768px)': { alignItems: 'flex-start' } }}>
        {/* Configure Security + any extra configure rows (e.g. MCP → Configure Policies).
            Cloud has no APIM behind this drawer — it configures security per
            environment from the env card's own Configure Security action. */}
        {!IS_CLOUD && <ConfigureActionRow Icon={ShieldCheck} label="Configure Security" onClick={() => setSecurityDrawerOpen(true)} />}
        {extraConfigureRows}
        {/* Lifecycle Status row */}
        {!IS_CLOUD && (
          <Stack direction="row" alignItems="center" gap={1}>
            <Button
              variant="text"
              size="small"
              onClick={() => navigate(`/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/manage/lifecycle`)}
              startIcon={<Recycle size={14} />}
              sx={{ color: 'text.secondary', textTransform: 'none', p: 0, minWidth: 0, '&:hover': { background: 'none', textDecoration: 'underline' } }}>
              Lifecycle Status
            </Button>
            {lifecycleStatus && <Chip label={LIFECYCLE_LABEL[lifecycleStatus] ?? lifecycleStatus} size="small" color={lifecycleColor} variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />}
          </Stack>
        )}
        {/* Guarded as a whole so cloud, showing neither, contributes no empty row to the gap. */}
        {(!IS_CLOUD || extra) && (
          <Stack direction="row" alignItems="center" gap={1}>
            {!IS_CLOUD && (
              <Tooltip title={isPublished ? 'Go to Developer Portal' : 'Publish API to access Developer Portal'}>
                <IconButton
                  size="small"
                  component="a"
                  href={devPortalUrl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  disabled={!isPublished || !devPortalUrl}
                  onClick={() => {
                    if (isPublished && devPortalUrl) trackEvent('component-manage-dev-portal');
                  }}
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, color: isPublished && devPortalUrl ? 'text.secondary' : 'text.disabled', pointerEvents: 'auto' }}>
                  <CodeXml size={16} />
                </IconButton>
              </Tooltip>
            )}
            {extra}
          </Stack>
        )}
      </Stack>
      {!IS_CLOUD && <SecurityDrawer open={securityDrawerOpen} onClose={() => setSecurityDrawerOpen(false)} apimId={apimId} componentId={componentId} versionId={versionId} />}
    </>
  );
}
