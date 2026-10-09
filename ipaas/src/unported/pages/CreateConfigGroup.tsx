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

import { Button, PageContent, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useCreateConfigGroup } from '../hooks/useConfigGroups';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { buildCreatePayload } from '../utils/configGroups';
import ConfigGroupForm from '../components/ConfigGroups/ConfigGroupForm';
import { HttpError } from '../../types/http';
import type { ConfigGroupSubmitValues } from '../../types/configGroups';
import type { OrgScope } from '../../nav';

export default function CreateConfigGroup(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const orgUuid = useOrgUuid();
  const base = `/organizations/${scope.org}/admin/config-groups`;
  const create = useCreateConfigGroup();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (values: ConfigGroupSubmitValues) => {
    setError(null);
    if (!orgUuid) {
      setError("Couldn't determine your organization. Please reload and try again.");
      return;
    }
    create.mutate(buildCreatePayload(orgUuid, values.handle, values.displayName, values.description, values.configurations), {
      onSuccess: () => navigate(base),
      onError: (e) => setError(e instanceof HttpError && e.status === 409 ? 'A configuration group with this handle already exists.' : "Couldn't create the configuration group. Please try again."),
    });
  };

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(base)} sx={{ mb: 2 }}>
        Back to configuration groups
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Create a Configuration Group
      </Typography>
      <ConfigGroupForm mode="create" orgHandle={scope.org} submitting={create.isPending} submitError={error} submitLabel="Create" onSubmit={onSubmit} onCancel={() => navigate(base)} />
    </PageContent>
  );
}
