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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, Drawer, IconButton, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft, ShieldCheck, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Navigate } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useApimApi, useApimSwagger, useUpdateApimApi } from '../../hooks/useApim';
import { useComponentByHandler, useComponentEndpoints } from '../../hooks/useComponents';
import { useProjectId } from '../../hooks/useProjects';
import { resourceUrl, type ComponentScope } from '../../nav';
import type { ApimApiOperation } from '../../types/apim';
import type { CorsConfig, RateLimitConfig } from '../../types/policy';
import { getApiBackendEndpoint } from '../utils/apim';
import { parseJsonSafe } from '../utils/json';
import { applyCors, applyRateLimit, corsFromApi, isRateLimitValid, rateLimitFromApi } from '../../utils/policy';
import DeploymentTrackBar from '../../components/DeploymentTrackBar';
import JsonView from '../components/JsonView';
import SearchField from '../../components/SearchField';
import SecurityDrawer from '../../components/SecurityDrawer';
import CorsSection from '../../components/Policies/CorsSection';
import RateLimitingSection from '../../components/Policies/RateLimitingSection';
import McpProxyCanvas from '../components/Policies/McpProxyCanvas';

/**
 * MCP "Configure Policies" page — the tool↔operation canvas plus an Add API
 * Policy drawer (Rate Limiting + CORS; Security reuses SecurityDrawer) and a
 * tool editor. Edits are staged and committed to the APIM API in one PUT.
 * MCP-only: any other component is redirected to its overview.
 */
const RATE_LIMIT_DESCRIPTION = 'Limit how many requests this MCP server accepts. Resource-level limits are managed per environment from the deployment settings.';

export default function McpPolicies(scope: ComponentScope): JSX.Element {
  const navigate = useAppNavigate();
  const { projectId, isLoading: loadingProject } = useProjectId(scope.project);
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);

  // Track → endpoint → APIM id (same resolution as the overview/lifecycle pages). Derived
  // rather than synced via an effect — an effect+render round trip here would delay
  // useComponentEndpoints below from becoming enabled.
  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  const [selectedTrackIdState, setSelectedTrackId] = useState('');
  const selectedTrackId = tracks.some((t) => t.id === selectedTrackIdState) ? selectedTrackIdState : (tracks.find((t) => t.latest)?.id ?? tracks[0]?.id ?? '');

  const { data: endpoints = [], isLoading: loadingEndpoints } = useComponentEndpoints(component?.id ?? '', selectedTrackId);
  const apimId = useMemo(() => endpoints.find((e) => e.apimId)?.apimId ?? null, [endpoints]);

  const { data: api = null, isLoading: loadingApi } = useApimApi(apimId);
  const { mutateAsync: updateApim, isPending: saving } = useUpdateApimApi();

  const backendEndpoint = useMemo(() => getApiBackendEndpoint(api), [api]);

  // Staged, dirty-tracked edits (policies + the exposed tools). Seeded once per
  // APIM id from the loaded API.
  const [rateLimit, setRateLimit] = useState<RateLimitConfig | null>(null);
  const [cors, setCors] = useState<CorsConfig | null>(null);
  const [operations, setOperations] = useState<ApimApiOperation[]>([]);
  const initial = useRef<{ rateLimit: RateLimitConfig; cors: CorsConfig; operations: ApimApiOperation[] } | null>(null);
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!api || !apimId || seededFor.current === apimId) return;
    const rl = rateLimitFromApi(api);
    const c = corsFromApi(api);
    const ops = api.operations ?? [];
    setRateLimit(rl);
    setCors(c);
    setOperations(ops);
    initial.current = { rateLimit: rl, cors: c, operations: ops };
    seededFor.current = apimId;
  }, [api, apimId]);

  const [policyOpen, setPolicyOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const { data: swagger, isLoading: loadingSwagger } = useApimSwagger(contractOpen ? apimId : null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchText, setSearchText] = useState('');

  // Per-tool editor + delete confirmation.
  const [editTool, setEditTool] = useState<ApimApiOperation | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [deleteTool, setDeleteTool] = useState<ApimApiOperation | null>(null);

  const openToolEditor = (op: ApimApiOperation) => {
    setEditTool(op);
    setEditName(op.target);
    setEditDesc(op.description ?? '');
  };
  const saveToolEdit = () => {
    if (!editTool) return;
    setOperations((ops) => ops.map((o) => (o === editTool ? { ...o, target: editName.trim() || o.target, description: editDesc } : o)));
    setEditTool(null);
  };
  const confirmDeleteTool = () => {
    if (!deleteTool) return;
    setOperations((ops) => ops.filter((o) => o !== deleteTool));
    setDeleteTool(null);
  };

  const dirty = !!rateLimit && !!cors && !!initial.current && JSON.stringify({ rateLimit, cors, operations }) !== JSON.stringify(initial.current);
  const valid = !rateLimit || isRateLimitValid(rateLimit);
  const canSave = !!api && !!apimId && dirty && valid && !saving;

  const handleSave = async () => {
    if (!api || !apimId || !rateLimit || !cors || !canSave) return;
    setError('');
    setSuccess('');
    try {
      const updated = { ...applyCors(applyRateLimit(api, rateLimit), cors), operations };
      await updateApim({ apimId, body: updated });
      initial.current = { rateLimit, cors, operations };
      setSuccess('Policies saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save policies.');
    }
  };

  const handleReset = () => {
    if (!initial.current) return;
    setRateLimit(initial.current.rateLimit);
    setCors(initial.current.cors);
    setOperations(initial.current.operations);
    setError('');
    setSuccess('');
  };

  // MCP-only guard — redirect any non-MCP component back to its overview.
  if (!loadingProject && !loadingComponent && component && component.componentSubType !== 'MCP') {
    return <Navigate to={resourceUrl(scope, 'overview')} replace />;
  }

  const loading = loadingProject || loadingComponent || (tracks.length > 0 && !selectedTrackId) || loadingEndpoints || (!!apimId && (loadingApi || !rateLimit || !cors));
  const versionId = selectedTrackId;
  const ready = !!apimId && !!api && !!rateLimit && !!cors;
  const editToolSchema = parseJsonSafe(editTool?.schemaDefinition);

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', flex: 1 }}>
      {tracks.length > 0 && <DeploymentTrackBar tracks={tracks} selectedId={selectedTrackId} onChange={setSelectedTrackId} orgHandler={scope.org} projectHandler={scope.project} componentHandler={scope.component} versionView />}

      <PageContent sx={{ pt: 5 }}>
        <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={() => navigate(resourceUrl(scope, 'overview'))} sx={{ mb: 2, textTransform: 'none' }}>
          Back
        </Button>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : !ready ? (
          <Alert severity="info">No managed API was found for this MCP server. Deploy it to configure its policies.</Alert>
        ) : (
          <Stack gap={2}>
            <SearchField value={searchText} onChange={setSearchText} placeholder="Filter input and output fields" fullWidth />

            <McpProxyCanvas
              operations={operations}
              backendEndpoint={backendEndpoint}
              searchText={searchText}
              onAddPolicy={() => setPolicyOpen(true)}
              onConfigureSecurity={() => setSecurityOpen(true)}
              onViewContract={() => setContractOpen(true)}
              onConfigureTool={openToolEditor}
              onDeleteTool={(op) => setDeleteTool(op)}
            />

            {error && (
              <Alert severity="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" onClose={() => setSuccess('')}>
                {success}
              </Alert>
            )}

            <Stack direction="row" gap={1}>
              <Button variant="contained" onClick={handleSave} disabled={!canSave} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="outlined" onClick={handleReset} disabled={!dirty || saving}>
                Reset
              </Button>
            </Stack>
          </Stack>
        )}

        {/* Add API Policy drawer — edits stage into the page's dirty state; Save lives on the canvas footer. */}
        <Drawer anchor="right" open={policyOpen} onClose={() => setPolicyOpen(false)} variant="temporary" sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', md: 960 }, display: 'flex', flexDirection: 'column' } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Typography variant="h5">API Policies</Typography>
            <IconButton size="small" aria-label="Close" onClick={() => setPolicyOpen(false)}>
              <X size={18} />
            </IconButton>
          </Stack>
          <Box sx={{ overflowY: 'auto', p: 3 }}>
            {rateLimit && cors && (
              <Stack gap={3}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Rate Limiting
                  </Typography>
                  <RateLimitingSection value={rateLimit} onChange={setRateLimit} disabled={saving} description={RATE_LIMIT_DESCRIPTION} />
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    CORS Configuration
                  </Typography>
                  <CorsSection value={cors} onChange={setCors} disabled={saving} />
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Security
                  </Typography>
                  <Button variant="outlined" size="small" startIcon={<ShieldCheck size={16} />} onClick={() => setSecurityOpen(true)}>
                    Configure Security
                  </Button>
                </Box>
              </Stack>
            )}
          </Box>
        </Drawer>

        {/* Service Contract — read-only OpenAPI spec, JSON view. */}
        <Drawer anchor="right" open={contractOpen} onClose={() => setContractOpen(false)} variant="temporary" sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', md: 760 }, display: 'flex', flexDirection: 'column' } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Typography variant="h5">OpenAPI Spec</Typography>
            <IconButton size="small" aria-label="Close" onClick={() => setContractOpen(false)}>
              <X size={18} />
            </IconButton>
          </Stack>
          <Box sx={{ overflowY: 'auto', p: 3, flex: 1 }}>
            {loadingSwagger ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={22} />
              </Box>
            ) : swagger ? (
              <JsonView value={swagger} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                No OpenAPI spec is available for this MCP server.
              </Typography>
            )}
          </Box>
        </Drawer>

        {/* Configure tool — edit name + description; schema shown read-only. */}
        <Drawer anchor="right" open={!!editTool} onClose={() => setEditTool(null)} variant="temporary" sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', md: 640 }, display: 'flex', flexDirection: 'column' } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Typography variant="h5">Tool</Typography>
            <IconButton size="small" aria-label="Close" onClick={() => setEditTool(null)}>
              <X size={18} />
            </IconButton>
          </Stack>
          <Box sx={{ overflowY: 'auto', p: 3, flex: 1 }}>
            <Stack gap={2.5}>
              <TextField size="small" label="Name" value={editName} onChange={(e) => setEditName(e.target.value)} fullWidth />
              <TextField size="small" label="Description" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} fullWidth multiline minRows={2} />
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Schema
                </Typography>
                {editToolSchema != null ? (
                  <JsonView value={editToolSchema} maxHeight="50vh" />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    This tool has no input schema.
                  </Typography>
                )}
              </Box>
            </Stack>
          </Box>
          <Stack direction="row" gap={1} sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Button variant="contained" onClick={saveToolEdit} disabled={!editName.trim()}>
              Apply
            </Button>
            <Button variant="outlined" onClick={() => setEditTool(null)}>
              Cancel
            </Button>
          </Stack>
        </Drawer>

        {/* Delete tool confirmation. */}
        <Dialog open={!!deleteTool} onClose={() => setDeleteTool(null)} maxWidth="xs">
          <DialogTitle>Remove &lsquo;{deleteTool?.target}&rsquo;</DialogTitle>
          <DialogContent>
            <DialogContentText>Are you sure you want to remove this tool? The change applies when you save.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" size="small" onClick={() => setDeleteTool(null)}>
              Cancel
            </Button>
            <Button variant="contained" color="error" size="small" onClick={confirmDeleteTool}>
              Remove
            </Button>
          </DialogActions>
        </Dialog>

        <SecurityDrawer open={securityOpen} onClose={() => setSecurityOpen(false)} apimId={apimId} componentId={component?.id} versionId={versionId} />
      </PageContent>
    </Box>
  );
}
