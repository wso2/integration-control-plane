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

import { Alert, Box, Button, Skeleton, Stack } from '@wso2/oxygen-ui';
import { Download, Upload } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useRef, useState, type ChangeEvent, type JSX } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { useGenaiServiceIdl, useUpdateGenaiServiceIdl } from '../../../hooks/useGenaiServices';
import { normalizeIdlContent } from '../../../utils/genaiServices';

/** Read-only contract view: hide the info block, authorize, and try-it-out. */
const hideInfoAndAuthorize = () => ({
  wrapComponents: {
    info: () => (): null => null,
    authorizeBtn: () => (): null => null,
  },
});
const disableTryItOut = () => ({
  statePlugins: {
    spec: {
      wrapSelectors: {
        allowTryItOutFor: () => () => false,
      },
    },
  },
});

/** View / download / import the OpenAPI service definition, rendered with Swagger UI. */
export default function ServiceDefinitionTab({ serviceId, canEdit }: { serviceId: string; canEdit: boolean }): JSX.Element {
  const { data: idl, isLoading, isError, refetch } = useGenaiServiceIdl(serviceId);
  const update = useUpdateGenaiServiceIdl(serviceId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const raw = useMemo(() => (idl?.content ? normalizeIdlContent(idl.content) : ''), [idl?.content]);
  const isJson = raw.trimStart().startsWith('{');
  // Swagger UI parses a YAML/JSON string spec; hand it an object when it's JSON.
  const spec = useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }, [raw]);

  const download = () => {
    if (!raw) return;
    const blob = new Blob([raw], { type: isJson ? 'application/json' : 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `service-definition.${isJson ? 'json' : 'yaml'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNotice(null);
    file
      .text()
      .then((text) => {
        update.mutate(text, {
          onSuccess: () => setNotice({ type: 'success', message: 'Service definition updated.' }),
          onError: (err) => setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update the service definition.' }),
        });
      })
      .catch(() => setNotice({ type: 'error', message: 'Could not read the selected file.' }));
  };

  // Skeleton until the IDL is fetched and parsed, so the swagger view doesn't flash an empty state.
  if (isLoading) {
    return (
      <Box>
        <Stack direction="row" gap={1.5} justifyContent="flex-end" sx={{ mb: 3 }}>
          <Skeleton variant="rounded" width={104} height={32} />
          <Skeleton variant="rounded" width={112} height={32} />
        </Stack>
        <Stack gap={1}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" height={44} />
          ))}
        </Stack>
      </Box>
    );
  }
  if (isError || !idl) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Failed to load the service definition.
      </Alert>
    );
  }

  return (
    <Box>
      {notice && (
        <Alert severity={notice.type} onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice.message}
        </Alert>
      )}

      <Stack direction="row" gap={1.5} justifyContent="flex-end" sx={{ mb: 3 }}>
        {canEdit && (
          <Button variant="outlined" startIcon={<Upload size={16} />} onClick={() => fileRef.current?.click()} disabled={update.isPending}>
            {update.isPending ? 'Importing…' : 'Import'}
          </Button>
        )}
        <Button variant="outlined" startIcon={<Download size={16} />} onClick={download} disabled={!raw}>
          Download
        </Button>
        <input ref={fileRef} type="file" hidden accept=".json,.yaml,.yml" onChange={onPick} aria-label="Import service definition" />
      </Stack>

      {spec ? (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            '& .swagger-ui .topbar': { display: 'none' },
            '& .swagger-ui .scheme-container': { display: 'none' },
            '& .swagger-ui .information-container': { display: 'none' },
          }}>
          <SwaggerUI spec={spec} docExpansion="list" defaultModelsExpandDepth={-1} plugins={[hideInfoAndAuthorize, disableTryItOut]} />
        </Box>
      ) : (
        <Alert severity="info">No service definition is available.</Alert>
      )}
    </Box>
  );
}
