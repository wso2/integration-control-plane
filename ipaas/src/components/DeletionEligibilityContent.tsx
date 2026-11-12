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

import { Alert, Button, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { AlertTriangle } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';

interface DeletionEligibilityContentProps {
  /** Singular entity name used in copy, e.g. "pipeline", "credential". */
  entityLabel: string;
  isLoading: boolean;
  /** True when the eligibility check failed or returned nothing to act on. */
  isError: boolean;
  canDelete: boolean;
  onRetry: () => void;
  /** Entity-specific "in use by …" details, shown when deletion is blocked. */
  blockedDetails: ReactNode;
}

/**
 * Shared body for deletion dialogs that gate on an async eligibility check:
 * renders the loading, error, deletable, and blocked states. The confirm
 * button itself lives in the enclosing ConfirmDeleteDialog.
 */
export default function DeletionEligibilityContent({ entityLabel, isLoading, isError, canDelete, onRetry, blockedDetails }: DeletionEligibilityContentProps): JSX.Element {
  if (isLoading) {
    return (
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ py: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          Checking whether this {entityLabel} can be deleted…
        </Typography>
      </Stack>
    );
  }
  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        }>
        Couldn&apos;t check deletion eligibility.
      </Alert>
    );
  }
  if (canDelete) {
    return (
      <Typography variant="body2" color="text.secondary">
        This permanently removes the {entityLabel}. This action can&apos;t be undone.
      </Typography>
    );
  }
  return (
    <Alert severity="warning" icon={<AlertTriangle size={20} />}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
        {`This ${entityLabel} is in use and can't be deleted.`}
      </Typography>
      {blockedDetails}
    </Alert>
  );
}
