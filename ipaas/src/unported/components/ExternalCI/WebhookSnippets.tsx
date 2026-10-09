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

import { Box, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { lazy, Suspense, useMemo, useState, type JSX } from 'react';
const CodeViewer = lazy(() => import('../../../components/CodeViewer'));
import { EXTERNAL_CI_PROVIDERS, getPipelineSnippet, type ExternalCiProvider } from '../../utils/externalCi';

const deployEndpoint = (): string => `${window.API_CONFIG?.choreoBaseApiUrl ?? ''}/devops/1.0.0/external-ci/deploy`;

/** The webhook-snippet tabs (cURL / GitHub / Google Cloud Build / Azure DevOps). */
export default function WebhookSnippets({ componentId, versionId }: { componentId: string; versionId: string }): JSX.Element {
  const [provider, setProvider] = useState<ExternalCiProvider>('curl');
  const endpoint = deployEndpoint();
  const current = EXTERNAL_CI_PROVIDERS.find((p) => p.key === provider) ?? EXTERNAL_CI_PROVIDERS[0];
  const snippet = useMemo(() => getPipelineSnippet(provider, { componentId, versionId, endpoint }), [provider, componentId, versionId, endpoint]);

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
        Webhook Snippets
      </Typography>
      <Tabs value={provider} onChange={(_, v) => setProvider(v as ExternalCiProvider)} sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2 }}>
        {EXTERNAL_CI_PROVIDERS.map((p) => (
          <Tab key={p.key} value={p.key} label={p.label} />
        ))}
      </Tabs>
      <Suspense fallback={null}>
        <CodeViewer code={snippet} language={current.language} showLineNumbers maxHeight={320} />
      </Suspense>
    </Box>
  );
}
