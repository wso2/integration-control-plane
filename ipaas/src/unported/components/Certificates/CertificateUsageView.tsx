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

import { Alert, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { Layers } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useCertificateUsage } from '../../hooks/useCertificates';
import EmptyListing from '../../../components/EmptyListing';
import UsageProjectsList from '../ConfigGroups/UsageProjectsList';

interface CertificateUsageViewProps {
  certificateId: string;
  active: boolean;
}

export default function CertificateUsageView({ certificateId, active }: CertificateUsageViewProps): JSX.Element {
  const { data, isLoading, isError } = useCertificateUsage(certificateId, active);
  const projects = data?.usageInProjects ?? [];

  if (isLoading) {
    return (
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ py: 4, justifyContent: 'center' }}>
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          Fetching the usages…
        </Typography>
      </Stack>
    );
  }

  if (isError) {
    return <Alert severity="error">Couldn&apos;t load usage for this certificate.</Alert>;
  }

  if (projects.length === 0) {
    return <EmptyListing icon={<Layers size={48} />} title="Not used yet" description="This certificate isn't referenced by any project, component, or release." />;
  }

  return <UsageProjectsList projects={projects} />;
}
