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

import { Alert, Button, CircularProgress, PageContent, PageTitle, Stack } from '@wso2/oxygen-ui';
import TextField from '../common/TextField';
import BusyFields from '../common/BusyFields';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useCreateDeploymentPipeline, useUpdateDeploymentPipeline } from '../../hooks/useDeploymentPipelines';
import type { CreateDeploymentPipelineRequest, DeploymentPipeline, EnvTemplate } from '../../types/deploymentPipeline';
import { buildPromotionTree, flattenPromotionTree, validatePipelineName } from '../../utils/deploymentPipeline';
import { orgCdPipelinesUrl } from '../../nav';
import PromotionChainBuilder from './PromotionChainBuilder';

/** Red `*` on the required-field label. */
const REQUIRED_SX = { '& .MuiFormLabel-asterisk': { color: 'error.main' } } as const;

interface CdPipelineFormProps {
  orgHandler: string;
  /** All org environment templates (the chain is built from these). */
  envTemplates: EnvTemplate[];
  /** Existing pipelines — used to reject duplicate names. */
  existingPipelines: DeploymentPipeline[];
  /** The pipeline being edited; omit for create. */
  existing?: DeploymentPipeline;
}

/**
 * Create/edit form for a deployment pipeline: name, default flag, and the
 * promotion chain. State is seeded once from `existing` (the parent keys this
 * by pipeline id so it remounts per pipeline — no effect-driven sync).
 */
export default function CdPipelineForm({ orgHandler, envTemplates, existingPipelines, existing }: CdPipelineFormProps): JSX.Element {
  const navigate = useAppNavigate();
  const create = useCreateDeploymentPipeline();
  const update = useUpdateDeploymentPipeline();

  const [name, setName] = useState(existing ? existing.name : '');
  const [nameTouched, setNameTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [chain, setChain] = useState<EnvTemplate[]>(() =>
    existing
      ? flattenPromotionTree(existing.promotion_tree)
          .map((e) => envTemplates.find((t) => t.id === e.envTemplateId))
          .filter((t): t is EnvTemplate => t != null)
      : [],
  );
  const [error, setError] = useState('');

  const nameError = useMemo(() => validatePipelineName(name, existingPipelines, existing?.id), [name, existingPipelines, existing]);
  // Once a save is in flight, suppress the field error: a successful create adds
  // this name to existingPipelines, which would briefly read as a duplicate
  // before navigation unmounts the form.
  const showNameError = nameTouched && !!nameError && !submitted;

  const saving = create.isPending || update.isPending;
  const canSave = !nameError && chain.length > 0 && !saving;
  const backUrl = orgCdPipelinesUrl({ org: orgHandler });

  const handleSave = () => {
    setError('');
    setSubmitted(true);
    const input: CreateDeploymentPipelineRequest = { name: name.trim(), promotion_tree: buildPromotionTree(chain) };
    const handlers = {
      onSuccess: () => navigate(backUrl),
      onError: (e: Error) => {
        setSubmitted(false);
        setError(e.message || 'Failed to save pipeline.');
      },
    };
    if (existing) update.mutate({ pipelineId: existing.id, input }, handlers);
    else create.mutate(input, handlers);
  };

  return (
    <PageContent>
      <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={() => navigate(backUrl)} sx={{ mb: 1, textTransform: 'none' }}>
        Back
      </Button>
      <PageTitle>
        <PageTitle.Header>{existing ? 'Edit Deployment Pipeline' : 'Create Deployment Pipeline'}</PageTitle.Header>
      </PageTitle>

      <Stack gap={3} sx={{ maxWidth: 640, mt: 1 }}>
        <BusyFields busy={saving}>
          {/* BusyFields is one child of the outer Stack, so its fields need their own gap. */}
          <Stack gap={3}>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setNameTouched(true)} fullWidth required error={showNameError} helperText={showNameError ? nameError : ' '} sx={REQUIRED_SX} />

            <PromotionChainBuilder envTemplates={envTemplates} value={chain} onChange={setChain} disabled={saving} />

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </BusyFields>

        <Stack direction="row" gap={1} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={handleSave} disabled={!canSave} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? 'Saving…' : existing ? 'Save Changes' : 'Create Pipeline'}
          </Button>
          <Button variant="outlined" onClick={() => navigate(backUrl)} disabled={saving}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </PageContent>
  );
}
