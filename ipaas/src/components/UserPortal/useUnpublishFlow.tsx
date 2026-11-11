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

import { Typography } from '@wso2/oxygen-ui';
import { useEffect, useState, type ReactNode } from 'react';
import { useUnpublishFromUserPortal, useUserPortalPublishability } from '../../hooks/useUserPortal';
import { refusalText, userPortalErrorText } from '../../utils/userPortal';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';
import UnpublishNote from './UnpublishNote';
import * as styles from './UserPortal.styles';

interface UnpublishFlowOptions {
  componentId: string;
  projectId: string;
  /** The environment's slug. */
  environment: string;
  envName: string;
  /** Unpublishing a workflow gives its Management API back to the console, which its confirmation says. */
  isWorkflow?: boolean;
  /** Runs as an unpublish is asked for, so what the last publish left on screen goes. */
  onStart?: () => void;
  /** Runs when an unpublish is done within its request; one that runs after it is reported by the publishability. */
  onUnpublished?: () => void;
}

export interface UnpublishFlow {
  /** Asks to confirm an unpublish, then unpublishes. */
  request: () => void;
  /** Unpublishes again, unconfirmed, to finish what the last unpublish couldn't: it is out of the User Portal already. */
  finish: () => void;
  /** The confirmation, while it is open; render it beside the control. */
  dialog: ReactNode;
  /**
   * Why the work after the last unpublish failed, or why a finish was refused, worded for the reader; null while it is
   * published, or an unpublish still runs. A confirmed unpublish shows its refusal in the dialog instead.
   */
  failure: string | null;
  /** An unpublish or a finish is being sent. */
  isPending: boolean;
  /** Clears the last unpublish's outcome. */
  reset: () => void;
}

/**
 * Unpublishing an integration from an environment's User Portal, as every place in the console offers it: confirmed
 * first, with what it does (`UnpublishNote`), and finished, unconfirmed, when the work after it failed. That work runs
 * after the response for an AI agent or a workflow, and the publishability says when it ends and how.
 */
export function useUnpublishFlow({ componentId, projectId, environment, envName, isWorkflow = false, onStart, onUnpublished }: UnpublishFlowOptions): UnpublishFlow {
  const unpublish = useUnpublishFromUserPortal();
  const { data: report } = useUserPortalPublishability(componentId, environment);
  const [confirming, setConfirming] = useState(false);

  // A finish refused earlier no longer stands once a run has started, or the integration is published again.
  const { reset } = unpublish;
  const settledElsewhere = !!report?.unpublishing || !!report?.published;
  useEffect(() => {
    if (settledElsewhere) reset();
  }, [settledElsewhere, reset]);

  const close = () => {
    reset();
    setConfirming(false);
  };
  const start = () =>
    unpublish.mutate(
      { componentId, environment },
      {
        onSuccess: ({ unpublishing }) => {
          setConfirming(false);
          if (!unpublishing) onUnpublished?.();
        },
      },
    );

  // Only while it is unpublished and nothing runs: a finish unpublishes, and is never offered on a published integration.
  const settled = !!report && !report.published && !report.publishing && !report.unpublishing;
  const finishRefused = unpublish.isError && !confirming ? userPortalErrorText(unpublish.error, envName) : null;
  const backgroundFailure = report?.unpublishError ? refusalText(report.unpublishError, envName) : null;

  return {
    request: () => {
      onStart?.();
      reset();
      setConfirming(true);
    },
    finish: () => {
      onStart?.();
      unpublish.mutate({ componentId, environment });
    },
    dialog: confirming ? (
      <ConfirmDeleteDialog title={`Unpublish from the User Portal in ${envName}?`} onConfirm={start} onClose={close} isPending={unpublish.isPending} confirmLabel="Unpublish" pendingLabel="Unpublishing…" maxWidth="xs">
        <UnpublishNote isWorkflow={isWorkflow} projectId={projectId} environment={environment} envName={envName} />
        {unpublish.isError && (
          <Typography variant="body2" color="error" sx={styles.dialogErrorSx}>
            {userPortalErrorText(unpublish.error, envName)}
          </Typography>
        )}
      </ConfirmDeleteDialog>
    ) : null,
    failure: settled ? (finishRefused ?? backgroundFailure) : null,
    isPending: unpublish.isPending,
    reset,
  };
}
