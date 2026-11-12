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
import { useEnableUserPortal, useUserPortalEnvironments, useUserPortalPublishability, useUserPortals } from '../../hooks/useUserPortal';
import type { Environment } from '../../types/environment';
import type { UserPortal, UserPortalPublishability, UserPortalState } from '../../types/userPortal';
import { apiErrorMessage, isUserPortalUnavailable } from '../../utils/apiErrors';
import { shownRefusals, unpublishingText, USER_PORTAL_NOT_ENABLED } from '../../utils/userPortal';
import EnableUserPortalDialog from './EnableUserPortalDialog';
import PublishButton from './PublishButton';
import PublishRefusals from './PublishRefusals';
import RejectedScopes from './RejectedScopes';
import { usePublishFlow } from './usePublishFlow';

const ENABLE_REFUSAL = "Your role can't enable the User Portal.";

// Rules no User Portal settles: an integration that breaks them can't be published from here at all.
const OUT_OF_REACH = new Set(['USER_PORTAL_NOT_PUBLISHABLE', 'USER_PORTAL_PIPELINE']);
// An environment off the User Portal's pipeline, worded as ipaas-service's code for one it can't use.
const NOT_A_PORTAL_ENVIRONMENT = { code: 'USER_PORTAL_INVALID_ENVIRONMENT', message: '' };
// A portal whose provision is done: it takes publishes, whether or not its pods are ready.
const PROVISIONED: ReadonlySet<UserPortalState> = new Set(['starting', 'active', 'unhealthy']);

interface UserPortalPromptProps {
  componentId: string;
  environment: Environment;
}

/**
 * The next step towards seeing a workflow in the User Portal, which serves views the console doesn't yet: enable the
 * User Portal in the environment, publish the workflow to it, or open it once the workflow is published there. A
 * publish follows the console's publishing rules, and is confirmed first when it redeploys the workflow.
 */
export default function UserPortalPrompt(props: UserPortalPromptProps): JSX.Element {
  // What an enable or a publish left on screen belongs to the environment it was made in.
  return <EnvironmentPrompt key={props.environment.id} {...props} />;
}

function EnvironmentPrompt({ componentId, environment }: UserPortalPromptProps): JSX.Element | null {
  const [portalQuery] = useUserPortals([environment.id]);
  // The environments a User Portal can run in. Where the read fails, Enable is still offered, and refused with the reason.
  const portalEnvironments = useUserPortalEnvironments();
  const portalProvisioned = !!portalQuery.data && PROVISIONED.has(portalQuery.data.state);
  // ipaas-service can still answer from before the portal it waited for came up: read again until it catches up.
  const publishability = useUserPortalPublishability(componentId, environment.id, { rereadWhile: (report) => portalProvisioned && notEnabledIn(report) });
  const can = useCan();
  const enable = useEnableUserPortal();
  const [enableOpen, setEnableOpen] = useState(false);
  const publish = usePublishFlow({ componentId, environment: environment.id, envName: environment.name, isWorkflow: true });

  const portal = portalQuery.data;
  const report = publishability.data;
  // The report is kept a while after it is read, so it can still say the portal isn't enabled once the portal it was
  // waiting for is up: read it again then, and every few seconds after while it still says so.
  const staleReport = portalProvisioned && !!report && notEnabledIn(report);
  const { refetch: rereadReport } = publishability;
  useEffect(() => {
    if (staleReport) void rereadReport();
  }, [staleReport, rereadReport]);

  if (portalQuery.isPending || publishability.isPending || portalEnvironments.isPending) return <Skeleton variant="rounded" width={200} height={36} />;
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

  // A published workflow is managed in the User Portal whatever rule it breaks now, so it is still opened there.
  const outOfReach = report.published ? [] : report.reasons.filter((r) => OUT_OF_REACH.has(r.code));
  if (outOfReach.length > 0) return <PublishRefusals reasons={outOfReach} envName={environment.name} />;

  switch (portal.state) {
    case 'not-enabled':
    case 'failed': {
      if (portalEnvironments.data && !portalEnvironments.data.some((env) => env.id === environment.id)) {
        return <PublishRefusals reasons={[NOT_A_PORTAL_ENVIRONMENT]} envName={environment.name} />;
      }
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
    // A provisioned portal takes publishes whether or not its pods are ready, as the env card's switch does; only
    // opening it waits for them.
    case 'starting':
    case 'unhealthy':
    case 'active':
      break;
  }

  if (report.published) {
    return (
      <Stack alignItems="center" gap={1}>
        <OpenUserPortal portal={portal} />
        <RejectedScopes scopes={publish.rejectedScopes} />
      </Stack>
    );
  }

  // While a stale report is read again, the portal it says isn't enabled is not listed.
  const reasons = shownRefusals(report.reasons).filter((r) => !staleReport || r.code !== USER_PORTAL_NOT_ENABLED);
  return (
    <Stack alignItems="center" gap={1}>
      <PublishButton
        flow={publish}
        publishable={report.publishable}
        redeploys={report.redeploys}
        busy={publishability.isFetching}
        holdReason={report.unpublishing ? unpublishingText(environment.name, true) : undefined}
        label="Publish to User Portal"
        variant="contained"
        size="medium"
      />
      {publish.progress && (
        <Typography variant="caption" color="text.secondary" textAlign="center">
          {publish.progress}
        </Typography>
      )}
      {/* A running publish is switching the workflow, so the rules read mid-switch aren't shown until it ends. */}
      {!report.publishing && reasons.length > 0 && <PublishRefusals reasons={reasons} envName={environment.name} />}
      {publish.error && (
        <Typography variant="caption" color="error">
          {publish.error}
        </Typography>
      )}
      <RejectedScopes scopes={publish.rejectedScopes} />
      {publish.dialog}
    </Stack>
  );
}

const notEnabledIn = (report: UserPortalPublishability): boolean => report.reasons.some((r) => r.code === USER_PORTAL_NOT_ENABLED);

/**
 * Opens the User Portal once its pods are ready. Until then it says why it can't be opened: still starting, or not
 * ready, with OpenChoreo's reason on hover. Enabling it again doesn't make it ready, so nothing else is offered.
 */
function OpenUserPortal({ portal }: { portal: UserPortal }): JSX.Element {
  if (portal.state === 'starting') {
    return (
      <Button variant="contained" disabled startIcon={<CircularProgress size={16} color="inherit" />}>
        Starting User Portal…
      </Button>
    );
  }
  if (portal.state === 'unhealthy') {
    return (
      <Tooltip title={portal.readinessMessage}>
        <span>
          <Button variant="contained" disabled>
            User Portal not ready
          </Button>
        </span>
      </Tooltip>
    );
  }
  return (
    <Button variant="contained" component="a" href={portal.url} target="_blank" rel="noopener noreferrer" disabled={!portal.url} startIcon={<ExternalLink size={16} />}>
      Open User Portal
    </Button>
  );
}
