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

import { Autocomplete, CircularProgress, PageContent, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import type { JSX, ReactNode } from 'react';
import type { GqlEnvironment } from '../../api/queries';
import TimeZoneToggle from '../TimeZoneToggle';

// Shared chrome for the workflow pages, including the loading, no-environment and no-permission states.
export default function WorkflowPageFrame({
  title,
  description,
  loading,
  environments,
  activeEnvId,
  onEnvChange,
  permitted,
  noPermissionMessage,
  children,
}: {
  title: string;
  description: ReactNode;
  loading: boolean;
  environments: GqlEnvironment[];
  activeEnvId: string;
  onEnvChange: (envId: string) => void;
  permitted: boolean;
  noPermissionMessage: string;
  children: ReactNode;
}): JSX.Element {
  if (loading)
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );

  const selectedEnv = environments.find((e) => e.id === activeEnvId) ?? null;
  return (
    <PageContent>
      <Stack component="header" direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 1 }}>
        <Typography variant="h1">{title}</Typography>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <TimeZoneToggle />
          <Autocomplete
            size="small"
            sx={{ width: 280 }}
            options={environments}
            getOptionLabel={(e) => e.name}
            value={selectedEnv}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, v) => onEnvChange(v?.id ?? '')}
            renderInput={(params) => <TextField {...params} label="Environment" placeholder="Select environment" />}
          />
        </Stack>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {description}
      </Typography>

      {environments.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          No environments found.
        </Typography>
      ) : !permitted ? (
        <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {noPermissionMessage}
        </Typography>
      ) : !activeEnvId ? (
        <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          Select an environment to continue.
        </Typography>
      ) : (
        children
      )}
    </PageContent>
  );
}
