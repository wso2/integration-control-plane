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

import { Box } from '@wso2/oxygen-ui';
import type { ApimApiInfo } from '../../../types/apim';
import ComplianceCard from './ComplianceCard';
import DocumentsCard from './DocumentsCard';
import SubscriptionPlansCard from './SubscriptionPlansCard';

interface BusinessInfoProps {
  projectId: string;
  componentId: string;
  apimId: string | null;
  apimApiInfo?: ApimApiInfo | null;
  activePolicies?: string[];
  docsPath?: string;
}

export default function BusinessInfo({ projectId, componentId, apimId, apimApiInfo, activePolicies, docsPath }: BusinessInfoProps) {
  return (
    <Box
      sx={{
        mt: 3,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '5fr 4fr 3fr' },
        gap: 3,
        width: '100%',
      }}>
      <SubscriptionPlansCard activePolicies={activePolicies} apimId={apimId} apimApiInfo={apimApiInfo} />
      <DocumentsCard apimId={apimId} docsPath={docsPath} />
      <ComplianceCard projectId={projectId} componentId={componentId} apimId={apimId} />
    </Box>
  );
}
