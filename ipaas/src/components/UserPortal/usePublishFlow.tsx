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
import { usePublishToUserPortal } from '../../hooks/useUserPortal';
import type { UserPortalPublication } from '../../types/userPortal';
import { userPortalErrorText } from '../../utils/userPortal';
import PublishWorkflowDialog from './PublishWorkflowDialog';

interface PublishFlowOptions {
  componentId: string;
  /** The environment's slug. */
  environment: string;
  envName: string;
  /** Runs as a publish starts. */
  onStart?: () => void;
  onPublished?: (publication: UserPortalPublication) => void;
}

export interface PublishFlow {
  /** Publishes, or first asks to confirm a publish that redeploys a workflow (its publishability's `redeploys`). */
  request: (redeploys: boolean) => void;
  /** The confirmation, while it is open; render it beside the button. */
  dialog: ReactNode;
  /** Why the last publish failed, worded for the reader. A confirmed publish shows its failure in the dialog instead. */
  error: string | null;
  isPending: boolean;
  /** Clears the last publish's outcome. */
  reset: () => void;
}

/**
 * Publishing an integration to an environment's User Portal, as every place in the console offers it. A publish that
 * redeploys a workflow so its Workflow Management API takes only User Portal sign-ins turns the console's workflow
 * management off in the environment, so it is confirmed first (`PublishWorkflowDialog`); any other publish goes
 * straight ahead.
 */
export function usePublishFlow({ componentId, environment, envName, onStart, onPublished }: PublishFlowOptions): PublishFlow {
  const publish = usePublishToUserPortal();
  const [confirming, setConfirming] = useState(false);

  const start = () => {
    onStart?.();
    publish.mutate(
      { componentId, environment },
      {
        onSuccess: (out) => {
          setConfirming(false);
          onPublished?.(out);
        },
      },
    );
  };
  const request = (redeploys: boolean) => {
    if (!redeploys) {
      start();
      return;
    }
    publish.reset();
    setConfirming(true);
  };
  const close = () => {
    publish.reset();
    setConfirming(false);
  };

  return {
    request,
    dialog: confirming ? <PublishWorkflowDialog envName={envName} onConfirm={start} onClose={close} isPending={publish.isPending} error={publish.isError ? userPortalErrorText(publish.error, envName) : null} /> : null,
    error: publish.isError && !confirming ? userPortalErrorText(publish.error, envName) : null,
    isPending: publish.isPending,
    reset: publish.reset,
  };
}
