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

import { Alert, Button, CircularProgress, MenuItem, PageContent, Stack, Typography, TextField } from '@wso2/oxygen-ui';
import { ArrowLeft, Wrench } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useComponentByHandler } from '../hooks/useComponents';
import { useApimApi } from '../hooks/useApim';
import { useProjectId } from '../hooks/useProjects';
import { useCreateMcpProxy } from '../hooks/useMcpProxy';
import { useComponentNameAvailability } from '../hooks/useRepository';
import { toHandler } from '../utils/string';
import { newComponentUrl, resourceUrl, type ProjectScope } from '../nav';

const ROW_GAP = 2;
const RESERVE_HELPER_SX = { '& .MuiFormHelperText-root': { minHeight: '1rem', mt: 0.5 } };

/**
 * "Generate MCP Server from an existing Integration as API" (the MCP proxy
 * convert flow). Always launched from a source component's Generate MCP button,
 * so the source is **fixed** (passed via `sourceApiId` = its APIM id, plus its
 * `sourceHandler`) and shown disabled — mirroring devant's `isProxyIdFromURL`
 * branch. The user names the MCP server, optionally picks which version of the
 * source API to convert, and creates it — running devant's exact backend
 * sequence via `useCreateMcpProxy`. No source repo, so this produces an MCP
 * **proxy**, exposing every operation of the chosen API version as a tool.
 */
export default function McpProxyFromApi(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const [searchParams] = useSearchParams();
  // The source is the Integration as API whose Generate MCP button was clicked.
  const apimIdParam = searchParams.get('sourceApiId');
  const sourceHandler = searchParams.get('sourceHandler');

  const { projectId } = useProjectId(scope.project);
  // Component detail carries the source's display name, apiId, and the full set
  // of API versions (each version is its own APIM API, keyed by its `id`).
  const { data: sourceDetail, isLoading: loadingSource } = useComponentByHandler(projectId, sourceHandler ?? undefined);
  const versions = useMemo(() => sourceDetail?.apiVersions ?? [], [sourceDetail]);

  // Which version of the source API to convert → its APIM API id. Defaults to the latest
  // version, falling back to the one the flow was launched from. Derived rather than synced
  // via an effect — an effect+render round trip here would delay useApimApi below.
  const [selectedApiIdState, setSelectedApiId] = useState('');
  const defaultApiId = (versions.find((v) => v.latest) ?? versions.find((v) => v.id === apimIdParam) ?? versions[0])?.id ?? apimIdParam ?? '';
  const selectedApiId = selectedApiIdState || defaultApiId;

  const apimId = selectedApiId || apimIdParam || sourceDetail?.apiId || null;
  const { data: apiInfo, isLoading: loadingApi } = useApimApi(apimId);
  // Every operation (path + verb) across all of the API's endpoints becomes an
  // MCP tool. Tool selection isn't supported yet, so we always expose them all.
  const operations = useMemo(() => apiInfo?.operations ?? [], [apiInfo]);
  const sourceApiVersion = apiInfo?.version ?? '';
  const sourceName = sourceDetail?.displayName ?? apiInfo?.name ?? '';

  // Where Back / Cancel return to: the source Integration as API's overview.
  const backUrl = sourceHandler ? resourceUrl({ level: 'components', org: scope.org, project: scope.project, component: sourceHandler }, 'overview') : newComponentUrl(scope);

  // Identity of the new MCP server. Display name is editable; the identifier is
  // seeded from it but separately editable (matches devant's name + identifier).
  const [displayName, setDisplayName] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0');
  useEffect(() => {
    if (sourceName) setDisplayName((prev) => prev || `${sourceName} MCP`);
  }, [sourceName]);
  // Keep the identifier in sync with the display name until the user edits it.
  useEffect(() => {
    if (!nameEdited) setName(toHandler(displayName));
  }, [displayName, nameEdited]);

  // Identifier uniqueness — same backend check used elsewhere in the console.
  const { data: nameAvail, isFetching: checkingName } = useComponentNameAvailability(projectId, name);
  // While the identifier is still auto-derived, snap to the unique alternate the
  // backend suggests (devant's behaviour when the user hasn't edited the name).
  useEffect(() => {
    if (!nameEdited && nameAvail && !nameAvail.componentNameUnique && nameAvail.alternateComponentName && nameAvail.alternateComponentName !== name) {
      setName(nameAvail.alternateComponentName);
    }
  }, [nameEdited, nameAvail, name]);

  const nameLengthValid = name.length >= 3 && name.length <= 64;
  const nameTaken = nameEdited && nameLengthValid && nameAvail != null && !nameAvail.componentNameUnique;
  const versionValid = /^\d+\.\d+(\.\d+)?$/.test(version.trim());
  // Base path the new MCP API is exposed on (read-only, devant-style).
  const basePath = `/${scope.project}/${name || '<identifier>'}/v${version || '1.0'}`;

  const identifierHelper = name && !nameLengthValid ? 'Use 3–64 characters.' : checkingName ? 'Checking availability…' : nameTaken ? 'This integration id is already taken.' : undefined;

  // Required fields: Display Name, Identifier, Version. The button enables once
  // they're all filled and valid, and the identifier isn't a known duplicate.
  // (Don't gate on an in-flight availability check — it leaves the button stuck
  // disabled.) We do require the source API to have loaded so we never submit an
  // empty tool set just because its operations hadn't arrived yet.
  const requiredFilled = displayName.trim().length > 0 && name.trim().length > 0 && version.trim().length > 0;

  const create = useCreateMcpProxy();
  const canSubmit = !!apimId && !!apiInfo && requiredFilled && nameLengthValid && !nameTaken && versionValid && !create.isPending;

  const handleSubmit = () => {
    if (!apimId || !canSubmit) return;
    // Tool selection isn't supported yet — expose every operation.
    const selectedOperations = operations.map((o) => ({ id: apimId, verb: o.verb, target: o.target, mcpFeature: 'Tool' as const }));
    create.mutate(
      { orgHandler: scope.org, projectId, name, displayName: displayName.trim(), description, context: basePath, version: version.trim(), endpoint: 'https://localhost:9001', policies: ['Bronze'], selectedOperations },
      { onSuccess: (component) => navigate(resourceUrl({ level: 'components', org: scope.org, project: scope.project, component: component.handler }, 'overview')) },
    );
  };

  return (
    <PageContent fullWidth>
      <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={() => navigate(backUrl)} sx={{ mb: 1, textTransform: 'none' }}>
        Back
      </Button>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
        <Typography variant="h1">Generate MCP Server</Typography>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Expose this Integration as API&apos;s operations as MCP tools.
      </Typography>

      {!apimId && !loadingSource ? (
        <Alert severity="info">No source API was provided. Open an Integration as API and use its Generate MCP Server action.</Alert>
      ) : (
        <Stack gap={ROW_GAP} sx={{ maxWidth: 760 }}>
          {/* Identity — Integration Name + Integration Id, two columns */}
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems="flex-start">
            <TextField labelPlacement="top" required size="small" label="Integration Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} fullWidth sx={{ flex: 1, ...RESERVE_HELPER_SX }} helperText=" " />
            <TextField
              labelPlacement="top"
              required
              size="small"
              label="Integration Id"
              value={name}
              onChange={(e) => {
                setNameEdited(true);
                setName(e.target.value);
              }}
              fullWidth
              sx={{ flex: 1, ...RESERVE_HELPER_SX }}
              error={(!!name && !nameLengthValid) || nameTaken}
              helperText={identifierHelper ?? ' '}
            />
          </Stack>

          {/* Description — own row */}
          <TextField labelPlacement="top" optional size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} sx={RESERVE_HELPER_SX} helperText=" " />

          {/* Version (new MCP, editable) + Base Path (disabled) — one row */}
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems="flex-start">
            <TextField
              labelPlacement="top"
              required
              size="small"
              label="Version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              sx={{ flex: 1, ...RESERVE_HELPER_SX }}
              error={!!version && !versionValid}
              helperText={version && !versionValid ? 'e.g. 1.0 or 1.0.0' : ' '}
            />
            <TextField labelPlacement="top" size="small" label="Base Path" value={basePath} fullWidth disabled sx={{ flex: 1, ...RESERVE_HELPER_SX, '& input': { fontFamily: 'monospace' } }} helperText=" " />
          </Stack>

          {/* Source Integration as API (disabled) + its API version (selectable) — one row */}
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems="flex-start">
            <TextField labelPlacement="top" size="small" label="Integration as API" value={loadingSource && !sourceName ? 'Loading…' : sourceName || '—'} fullWidth disabled sx={{ flex: 1, ...RESERVE_HELPER_SX }} helperText=" " />
            {versions.length > 0 ? (
              <TextField labelPlacement="top" select size="small" label="Source API Version" value={selectedApiId} onChange={(e) => setSelectedApiId(e.target.value)} sx={{ flex: 1, ...RESERVE_HELPER_SX }} helperText=" ">
                {versions.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.apiVersion}
                    {v.latest ? ' (latest)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField labelPlacement="top" size="small" label="Source API Version" value={loadingApi || loadingSource ? 'Loading…' : sourceApiVersion || '—'} disabled sx={{ flex: 1, ...RESERVE_HELPER_SX }} helperText=" " />
            )}
          </Stack>

          {create.isError && <Alert severity="error">Failed to create the MCP server. Please try again.</Alert>}

          <Stack direction="row" gap={1} sx={{ mt: 1 }}>
            <Button variant="contained" startIcon={create.isPending ? <CircularProgress color="inherit" size={16} /> : <Wrench size={16} />} onClick={handleSubmit} disabled={!canSubmit}>
              {create.isPending ? 'Creating & Deploying ...' : 'Create & Deploy'}
            </Button>
            <Button variant="outlined" onClick={() => navigate(backUrl)} disabled={create.isPending}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      )}
    </PageContent>
  );
}
