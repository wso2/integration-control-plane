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
import { publishingText, refusalText, shownRefusals, unpublishingText, userPortalErrorText } from '../../utils/userPortal';
import PublishDialog from './PublishDialog';

interface PublishFlowOptions {
  componentId: string;
  /** The environment's slug. */
  environment: string;
  envName: string;
  /** A workflow's publish and unpublish redeploy it, which their notes say. */
  isWorkflow?: boolean;
  /** Runs as a publish is asked for, before it is confirmed, so what the last one left on screen goes. */
  onStart?: () => void;
  /**
   * Runs when a publish is done within its request, with the scopes the User Portal couldn't hold.
   */
  onPublished?: (rejectedScopes: string[]) => void;
}

export interface PublishFlow {
  /** Asks to confirm a publish, then publishes. */
  request: () => void;
  /** The confirmation, while it is open; render it beside the control that asks for it. */
  dialog: ReactNode;
  /**
   * Why the last publish failed in the background, worded for the reader, while the publishability still reports it. A
   * refused publish shows its refusal in the confirmation, which stays open on it.
   */
  error: string | null;
  /**
   * What a publish running in the background is doing, or an unpublish giving a workflow back to the console, worded for
   * the reader; null when neither is running.
   */
  progress: string | null;
  /** Scopes the last publish's endpoints require that the User Portal couldn't hold (`RejectedScopes` says so). */
  rejectedScopes: string[];
  /** A publish is being sent, or is finishing in the background. */
  isPending: boolean;
  /** Clears the last publish's outcome. */
  reset: () => void;
}

/**
 * Publishing an integration to an environment's User Portal, as every place in the console offers it. Every publish is
 * confirmed first, as an unpublish is (`PublishDialog`). One that redeploys a workflow so its Workflow Management API
 * takes only User Portal sign-ins turns the console's workflow management off in the environment, which its
 * confirmation warns of while the publishability says so. An AI agent's or a workflow's publish finishes in the
 * background after it is accepted, as bringing the User Portal's scopes in step can take a while: the flow stays
 * pending, and the publishability, which survives a page reload, says when it ends and how.
 */
export function usePublishFlow({ componentId, environment, envName, isWorkflow = false, onStart, onPublished }: PublishFlowOptions): PublishFlow {
  const publish = usePublishToUserPortal({ onPublished });
  const { data: report, refetch } = useUserPortalPublishability(componentId, environment);
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
  const request = () => {
    onStart?.();
    publish.reset();
    setRejectedScopes([]);
    setConfirming(true);
    void refetch();
  };
  const backgroundError = report && !report.publishing && !report.published && report.publishError ? refusalText(report.publishError, envName) : null;
  const close = () => {
    publish.reset();
    setConfirming(false);
  };

  return {
    request,
    // The confirmation follows the publishability as it is read again while it is open, so a publish that has come to
    // redeploy a workflow is never confirmed without the warning, and one the rules now refuse isn't offered.
    dialog:
      confirming && report ? (
        <PublishDialog
          envName={envName}
          redeploys={report.redeploys}
          refusals={report.publishable ? [] : shownRefusals(report.reasons)}
          onConfirm={start}
          onClose={close}
          isPending={publish.isPending}
          error={publish.isError ? userPortalErrorText(publish.error, envName) : null}
        />
      ) : null,
    error: publish.isPending ? null : backgroundError,
    progress: publishing ? publishingText(envName, isWorkflow) : report?.unpublishing ? unpublishingText(envName, isWorkflow) : null,
    // The sync answer's scopes, or those of the background publish the report carries, only while it is published.
    rejectedScopes: rejectedScopes.length > 0 ? rejectedScopes : report?.published ? report.rejectedScopes : [],
    isPending: publish.isPending || publishing,
    reset: () => {
      publish.reset();
      setRejectedScopes([]);
    },
  };
}
