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
import type { JSX } from 'react';
import CreateIntegrationPanels from '../components/CreateIntegrationPanels';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { resourceUrl, type ProjectScope } from '../nav';

export default function CreateIntegrationOptions(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();

  return (
    <PageContent sx={{ pt: 5 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(resourceUrl(scope, 'overview'))} sx={{ mb: 3 }}>
        Back to Project Home
      </Button>
      <CreateIntegrationPanels
        scope={scope}
        heading={
          <Typography variant="h1" sx={{ mb: 4 }}>
            How would you like to create your integration?
          </Typography>
        }
      />
    </PageContent>
  );
}
