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

import { Button, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useGrantOwnerAccess } from '../../../hooks/useContextEngine';
import { HttpError } from '../../../types/http';

interface OwnerAccessButtonProps {
  engineId: string;
  /** Called once the grant is in place, e.g. to retry what was refused. */
  onGranted?: () => void;
}

/**
 * Offered where the engine refused the signed-in user: gives them the creator's
 * grant (query + enrich). Engines created before the wizard added that grant
 * need it once; the engine allows it only for holders of access.manage.
 */
export default function OwnerAccessButton({ engineId, onGranted }: OwnerAccessButtonProps): JSX.Element {
  const grant = useGrantOwnerAccess(engineId);
  if (grant.isSuccess) {
    return (
      <Typography variant="caption" sx={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>
        Access granted
      </Typography>
    );
  }
  return (
    <Stack alignItems="flex-end" gap={0.5}>
      <Button
        size="small"
        color="inherit"
        variant="outlined"
        disabled={grant.isPending}
        startIcon={grant.isPending ? <CircularProgress size={12} color="inherit" /> : undefined}
        onClick={() => grant.mutate(undefined, { onSuccess: () => onGranted?.() })}
        sx={{ whiteSpace: 'nowrap' }}>
        {grant.isPending ? 'Granting…' : 'Give me access'}
      </Button>
      {grant.isError && (
        <Typography variant="caption" color="error" sx={{ maxWidth: 220, textAlign: 'right' }}>
          {grant.error instanceof HttpError && grant.error.status === 403 ? 'Only someone who manages access on this engine can grant it.' : "Couldn't grant access. Please try again."}
        </Typography>
      )}
    </Stack>
  );
}
