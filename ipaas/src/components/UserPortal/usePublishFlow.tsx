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
import { publishingText, refusalText, unpublishingText, userPortalErrorText } from '../../utils/userPortal';
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
  /** Runs when a publish is done within its request, with the scopes the User Portal couldn't hold. */
  onPublished?: (rejectedScopes: string[]) => void;
}

export interface PublishFlow {
  /** Asks to confirm a publish, then publishes; the confirmation warns of a workflow's redeploy (its publishability's `redeploys`). */
  request: (redeploys: boolean) => void;
  /** The confirmation, while it is open; render it beside the button. */
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
  /** A publish is being sent, or is finishing in the background. */
  isPending: boolean;
  /** Clears the last publish's outcome. */
  reset: () => void;
}

/**
 * Publishing an integration to an environment's User Portal, as every place in the console offers it. Every publish is
 * confirmed first, as an unpublish is (`PublishDialog`). One that redeploys a workflow so its Workflow Management API
 * takes only User Portal sign-ins turns the console's workflow management off in the environment, which its
 * confirmation warns of. An AI agent's or a workflow's publish finishes in the background after it is accepted, as bringing
 * the User Portal's scopes in step can take a while: the flow stays pending, and the publishability, which survives a
 * page reload, says when it ends and how.
 */
export function usePublishFlow({ componentId, environment, envName, isWorkflow = false, onStart, onPublished }: PublishFlowOptions): PublishFlow {
  const publish = usePublishToUserPortal();
  const { data: report } = useUserPortalPublishability(componentId, environment);
  const publishing = !!report?.publishing;
  // The open confirmation, with whether the publish it confirms redeploys a workflow.
  const [confirming, setConfirming] = useState<{ redeploys: boolean } | null>(null);

  const start = () => {
    publish.mutate(
      { componentId, environment },
      {
        onSuccess: (out) => {
          setConfirming(null);
          if (!out.publishing) onPublished?.(out.rejectedScopes);
        },
      },
    );
  };
  const request = (redeploys: boolean) => {
    onStart?.();
    publish.reset();
    setConfirming({ redeploys });
  };
  const backgroundError = report && !report.publishing && !report.published && report.publishError ? refusalText(report.publishError, envName) : null;
  const close = () => {
    publish.reset();
    setConfirming(null);
  };

  return {
    request,
    dialog: confirming ? <PublishDialog envName={envName} redeploys={confirming.redeploys} onConfirm={start} onClose={close} isPending={publish.isPending} error={publish.isError ? userPortalErrorText(publish.error, envName) : null} /> : null,
    error: publish.isPending ? null : backgroundError,
    progress: publishing ? publishingText(envName, isWorkflow) : report?.unpublishing ? unpublishingText(envName, isWorkflow) : null,
    isPending: publish.isPending || publishing,
    reset: () => publish.reset(),
  };
}
