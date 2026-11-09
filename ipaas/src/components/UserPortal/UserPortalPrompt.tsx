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

import { Button, CircularProgress, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ExternalLink } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import { useEnableUserPortal, useUserPortalPublishability, useUserPortals } from '../../hooks/useUserPortal';
import type { Environment } from '../../types/environment';
import { apiErrorMessage, isUserPortalUnavailable } from '../../utils/apiErrors';
import { shownRefusals, USER_PORTAL_NOT_ENABLED } from '../../utils/userPortal';
import EnableUserPortalDialog from './EnableUserPortalDialog';
import PublishRefusals from './PublishRefusals';
import { usePublishFlow } from './usePublishFlow';

const ENABLE_REFUSAL = "Your role can't enable the User Portal.";
const DEPLOY_REFUSAL = "Your role can't publish integrations to the User Portal.";

// Rules no User Portal settles: an integration that breaks them can't be published from here at all.
const OUT_OF_REACH = new Set(['USER_PORTAL_NOT_PUBLISHABLE', 'USER_PORTAL_PIPELINE']);

interface UserPortalPromptProps {
  orgHandler: string;
  componentId: string;
  environment: Environment;
}

/**
 * The next step towards seeing a workflow in the User Portal, which serves views the console doesn't yet: enable the
 * User Portal in the environment, publish the workflow to it, or open it once the workflow is published there. A
 * publish follows the console's publishing rules, and is confirmed first when it redeploys the workflow.
 */
export default function UserPortalPrompt({ orgHandler, componentId, environment }: UserPortalPromptProps): JSX.Element | null {
  const [portalQuery] = useUserPortals([environment.id]);
  const publishability = useUserPortalPublishability(componentId, environment.id);
  const can = useCan();
  const enable = useEnableUserPortal();
  const [enableOpen, setEnableOpen] = useState(false);
  const publish = usePublishFlow({ componentId, environment: environment.id, envName: environment.name });

  const portal = portalQuery.data;
  const report = publishability.data;
  // The report is kept a while after it is read, so it can still say the portal isn't enabled once the portal it was
  // waiting for is up: read it again then.
  const staleReport = portal?.state === 'active' && !!report?.reasons.some((r) => r.code === USER_PORTAL_NOT_ENABLED);
  const { refetch: rereadReport } = publishability;
  useEffect(() => {
    if (staleReport) void rereadReport();
  }, [staleReport, rereadReport]);

  if (portalQuery.isPending || publishability.isPending) return <Skeleton variant="rounded" width={200} height={36} />;
  // A BFF that serves no User Portal has none to offer.
  if (isUserPortalUnavailable(portalQuery.error) || isUserPortalUnavailable(publishability.error)) return null;
  if (!portal || !report) {
    return (
      <Stack alignItems="center" gap={1}>
        <Typography variant="caption" color="error">
          Could not check the User Portal.
        </Typography>
        <Button
          size="small"
          onClick={() => {
            void portalQuery.refetch();
            void publishability.refetch();
          }}>
          Retry
        </Button>
      </Stack>
    );
  }

  const outOfReach = report.reasons.filter((r) => OUT_OF_REACH.has(r.code));
  if (outOfReach.length > 0) return <PublishRefusals reasons={outOfReach} envName={environment.name} orgHandler={orgHandler} />;

  switch (portal.state) {
    case 'not-enabled':
    case 'failed': {
      const refusal = can(Scopes.ENVIRONMENT_MANAGE) ? '' : ENABLE_REFUSAL;
      const openEnable = () => {
        enable.reset();
        setEnableOpen(true);
      };
      return (
        <Stack alignItems="center" gap={1}>
          <Tooltip title={refusal}>
            <span>
              <Button variant="contained" onClick={openEnable} disabled={!!refusal}>
                Enable User Portal
              </Button>
            </span>
          </Tooltip>
          {portal.state === 'failed' && (
            <Typography variant="caption" color="error">
              {portal.error ?? `Setting up the User Portal in ${environment.name} failed.`}
            </Typography>
          )}
          {enableOpen && (
            <EnableUserPortalDialog
              environments={[environment]}
              isPending={enable.isPending}
              error={enable.isError ? apiErrorMessage(enable.error, 'Something went wrong.') : null}
              onEnable={(env) => enable.mutate(env, { onSuccess: () => setEnableOpen(false) })}
              onClose={() => setEnableOpen(false)}
            />
          )}
        </Stack>
      );
    }
    case 'setting-up':
      return (
        <Button variant="contained" disabled startIcon={<CircularProgress size={16} color="inherit" />}>
          Setting up User Portal…
        </Button>
      );
    case 'removing':
      return (
        <Typography variant="caption" color="text.secondary">
          The User Portal in {environment.name} is being removed.
        </Typography>
      );
    case 'active':
      break;
  }

  if (report.published) {
    return (
      <Button variant="contained" component="a" href={portal.url} target="_blank" rel="noopener noreferrer" disabled={!portal.url} startIcon={<ExternalLink size={16} />}>
        Open User Portal
      </Button>
    );
  }

  // While a stale report is read again, the portal it says isn't enabled is not listed.
  const reasons = shownRefusals(report.reasons).filter((r) => !staleReport || r.code !== USER_PORTAL_NOT_ENABLED);
  const deployRefusal = can(Scopes.INTEGRATION_DEPLOY) ? '' : DEPLOY_REFUSAL;
  return (
    <Stack alignItems="center" gap={1}>
      <Tooltip title={deployRefusal || (report.publishable ? '' : 'Fix what is listed below to publish.')}>
        <span>
          <Button
            variant="contained"
            onClick={() => publish.request(report.redeploys)}
            disabled={!!deployRefusal || !report.publishable || publish.isPending || publishability.isFetching}
            startIcon={publish.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {publish.isPending ? 'Publishing…' : 'Publish to User Portal'}
          </Button>
        </span>
      </Tooltip>
      {reasons.length > 0 && <PublishRefusals reasons={reasons} envName={environment.name} orgHandler={orgHandler} />}
      {publish.error && (
        <Typography variant="caption" color="error">
          {publish.error}
        </Typography>
      )}
      {publish.dialog}
    </Stack>
  );
}
