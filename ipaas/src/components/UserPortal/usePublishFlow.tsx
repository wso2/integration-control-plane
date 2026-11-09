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

import { useState, type ReactNode } from 'react';
import { usePublishToUserPortal, useUserPortalPublishability } from '../../hooks/useUserPortal';
import { publishingText, refusalText, userPortalErrorText } from '../../utils/userPortal';
import PublishWorkflowDialog from './PublishWorkflowDialog';

interface PublishFlowOptions {
  componentId: string;
  /** The environment's slug. */
  environment: string;
  envName: string;
  /** Runs as a publish is asked for, before it is confirmed, so what the last one left on screen goes. */
  onStart?: () => void;
}

export interface PublishFlow {
  /** Publishes, or first asks to confirm a publish that redeploys a workflow (its publishability's `redeploys`). */
  request: (redeploys: boolean) => void;
  /** The confirmation, while it is open; render it beside the button. */
  dialog: ReactNode;
  /**
   * Why the last publish failed, worded for the reader: a refused one, or a background one the publishability still
   * reports. A confirmed publish shows its refusal in the dialog instead.
   */
  error: string | null;
  /** What a publish running in the background is doing, worded for the reader; null when none is running. */
  progress: string | null;
  /** Scopes the last publish's endpoints require that the User Portal couldn't hold (`RejectedScopes` says so). */
  rejectedScopes: string[];
  /** A publish is being sent, or is finishing in the background. */
  isPending: boolean;
  /** Clears the last publish's outcome. */
  reset: () => void;
}

/**
 * Publishing an integration to an environment's User Portal, as every place in the console offers it. A publish that
 * redeploys a workflow so its Workflow Management API takes only User Portal sign-ins turns the console's workflow
 * management off in the environment, so it is confirmed first (`PublishWorkflowDialog`); any other publish goes
 * straight ahead. A workflow's publish finishes in the background after it is accepted: the flow stays pending, and
 * the publishability, which survives a page reload, says when it ends and how.
 */
export function usePublishFlow({ componentId, environment, envName, onStart }: PublishFlowOptions): PublishFlow {
  const publish = usePublishToUserPortal();
  const { data: report } = useUserPortalPublishability(componentId, environment);
  const publishing = !!report?.publishing;
  const [confirming, setConfirming] = useState(false);
  const [rejectedScopes, setRejectedScopes] = useState<string[]>([]);

  const start = () => {
    publish.mutate(
      { componentId, environment },
      {
        onSuccess: (out) => {
          setConfirming(false);
          setRejectedScopes(out.rejectedScopes);
        },
      },
    );
  };
  const request = (redeploys: boolean) => {
    onStart?.();
    setRejectedScopes([]);
    if (!redeploys) {
      start();
      return;
    }
    publish.reset();
    setConfirming(true);
  };
  const backgroundError = report && !report.publishing && !report.published && report.publishError ? refusalText(report.publishError, envName) : null;
  const close = () => {
    publish.reset();
    setConfirming(false);
  };

  return {
    request,
    dialog: confirming ? <PublishWorkflowDialog envName={envName} onConfirm={start} onClose={close} isPending={publish.isPending} error={publish.isError ? userPortalErrorText(publish.error, envName) : null} /> : null,
    error: publish.isError && !confirming ? userPortalErrorText(publish.error, envName) : publish.isPending ? null : backgroundError,
    progress: publishing ? publishingText(envName) : null,
    // The sync answer's scopes, or those of the background publish the report carries once it is published.
    rejectedScopes: rejectedScopes.length > 0 ? rejectedScopes : (report?.rejectedScopes ?? []),
    isPending: publish.isPending || publishing,
    reset: () => {
      publish.reset();
      setRejectedScopes([]);
    },
  };
}
