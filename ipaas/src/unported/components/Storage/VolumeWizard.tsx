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

import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, FormGroup, IconButton, ListingTable, MenuItem, Select, Slider, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { ArrowLeft, Info, Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useRef, useState, type JSX } from 'react';
import { useCreateVolume, useCreateVolumeMount, useDeleteVolumeMount, useStorageClasses, useUpdateVolumeMount } from '../../hooks/useStorage';
import { PVC_CAPACITY_DEFAULT_GI, PVC_CAPACITY_MAX_GI, PVC_CAPACITY_MIN_GI, VOLUME_ACCESS_MODES, VOLUME_TYPE_CARDS } from '../../constants/storage';
import { buildVolumeCreatePayload, validateMountPath, validateVolumeName } from '../../utils/storage';
import VerticalStepper from '../../../components/VerticalStepper';
import VolumeTypeCard from './VolumeTypeCard';
import { VolumeFormType, type VolumeAccessMode, type VolumeFormType as VolumeFormTypeT, type VolumeMountDraft, type VolumeMountPath, type VolumeRow } from '../../../types/storage';

const STEPS = ['Volume Details', 'Container Mount Details'];

export interface VolumeWizardCtx {
  orgUuid: string;
  projectId: string;
  componentId: string;
  releaseId: string;
  environmentId: string;
  containerId: string;
  containerName: string;
  isPDP: boolean;
}

interface VolumeWizardProps {
  ctx: VolumeWizardCtx;
  existing?: VolumeRow;
  onBack: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

const requiredSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } };

function RequiredLabel({ children }: { children: string }): JSX.Element {
  return (
    <Typography variant="body2" sx={{ mb: 0.5 }}>
      {children}{' '}
      <Box component="span" sx={{ color: 'error.main' }}>
        *
      </Box>
    </Typography>
  );
}

export default function VolumeWizard({ ctx, existing, onBack, onSaved, onError }: VolumeWizardProps): JSX.Element {
  const isEdit = !!existing;
  const mountPathBase: VolumeMountPath = { componentId: ctx.componentId, releaseId: ctx.releaseId, containerId: ctx.containerId };

  const createVolume = useCreateVolume(ctx.projectId);
  const createMount = useCreateVolumeMount(ctx.projectId);
  const updateMount = useUpdateVolumeMount(ctx.projectId);
  const deleteMount = useDeleteVolumeMount(ctx.projectId);

  const [step, setStep] = useState(isEdit ? 1 : 0);
  const [name, setName] = useState(existing?.volume.name ?? '');
  const [formType, setFormType] = useState<VolumeFormTypeT>(VolumeFormType.EmptyDirMemory);
  const [submitting, setSubmitting] = useState(false);

  const isPvc = formType === VolumeFormType.Pvc;
  const [storageClassName, setStorageClassName] = useState('');
  const [capacityGi, setCapacityGi] = useState(PVC_CAPACITY_DEFAULT_GI);
  const [accessModes, setAccessModes] = useState<VolumeAccessMode[]>(['ReadWriteOnce']);
  const { data: storageClasses = [] } = useStorageClasses(ctx.projectId, ctx.environmentId, isPvc);

  const draftId = useRef(0);
  const [drafts, setDrafts] = useState<VolumeMountDraft[]>(() => (existing?.mounts ?? []).map((m) => ({ id: m.ID, containerId: m.container_id, mountPath: m.MountPath, readOnly: m.ReadOnly, existing: true })));
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [mountPath, setMountPath] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [mountTouched, setMountTouched] = useState(false);

  const nameError = validateVolumeName(name);
  const pvcValid = !isPvc || (!!storageClassName && accessModes.length > 0);
  const step1Valid = !nameError && !!formType && pvcValid;

  const toggleAccessMode = (mode: VolumeAccessMode) => setAccessModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));

  const mountFormatError = validateMountPath(mountPath);
  const duplicateMount = !mountFormatError && drafts.some((d) => d.id !== editingId && d.mountPath === mountPath.trim());
  const mountError = mountFormatError ?? (duplicateMount ? 'This mount path is already added' : undefined);
  const canAddMount = !mountError;

  const addMount = () => {
    if (!canAddMount) return;
    const path = mountPath.trim();
    // Editing an existing row updates it in place (keeps its id/`existing`), so submitEdit issues a
    // single updateMount instead of delete+create.
    if (editingId) setDrafts((prev) => prev.map((d) => (d.id === editingId ? { ...d, mountPath: path } : d)));
    else setDrafts((prev) => [...prev, { id: `new-${draftId.current++}`, containerId: ctx.containerId, mountPath: path, readOnly: false }]);
    setEditingId(null);
    setMountPath('');
    setMountTouched(false);
  };

  const editMount = (draft: VolumeMountDraft) => {
    setMountPath(draft.mountPath);
    setEditingId(draft.id);
  };

  const removeMount = (draft: VolumeMountDraft) => {
    if (draft.id === editingId) {
      setEditingId(null);
      setMountPath('');
    }
    if (draft.existing) setDeletedIds((prev) => [...prev, draft.id]);
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
  };

  const canSave = drafts.length > 0 && !submitting;

  const submitCreate = async () => {
    const volume = await createVolume.mutateAsync(
      buildVolumeCreatePayload({
        name,
        formType,
        organizationUuid: ctx.orgUuid,
        projectId: ctx.projectId,
        appEnvironmentId: ctx.releaseId,
        environmentId: ctx.environmentId,
        pvc: isPvc ? { storageClassName, capacityGi, accessModes } : undefined,
      }),
    );
    await Promise.all(drafts.map((draft) => createMount.mutateAsync({ path: mountPathBase, data: { app_volume_id: volume.ID, mountPath: draft.mountPath, readOnly: draft.readOnly } })));
  };

  const submitEdit = async () => {
    const volumeId = existing!.volume.ID;
    for (const id of deletedIds) {
      await deleteMount.mutateAsync({ path: mountPathBase, mountId: id });
    }
    const original = new Map((existing?.mounts ?? []).map((m) => [m.ID, m]));
    for (const draft of drafts) {
      if (!draft.existing) {
        await createMount.mutateAsync({ path: mountPathBase, data: { app_volume_id: volumeId, mountPath: draft.mountPath, readOnly: draft.readOnly } });
      } else if (original.get(draft.id)?.MountPath !== draft.mountPath) {
        await updateMount.mutateAsync({ path: mountPathBase, mountId: draft.id, data: { mountPath: draft.mountPath, readOnly: draft.readOnly } });
      }
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      if (isEdit) await submitEdit();
      else await submitCreate();
      onSaved(isEdit ? 'Volume mount updated.' : 'Volume mount created.');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save the volume mount.');
    } finally {
      setSubmitting(false);
    }
  };

  const memoryWarning = useMemo(() => formType === VolumeFormType.EmptyDirMemory, [formType]);

  return (
    <Box>
      <Button variant="text" startIcon={<ArrowLeft size={18} />} onClick={onBack} sx={{ mb: 2 }}>
        {isEdit ? 'Back to Volume Mount List' : 'Go back to list'}
      </Button>

      <Stack direction={{ xs: 'column', md: 'row' }} gap={4}>
        <Box sx={{ width: { xs: '100%', md: 260 }, flexShrink: 0 }}>
          <VerticalStepper activeStep={step} steps={STEPS} />
        </Box>

        <Box sx={{ flex: 1, maxWidth: 820 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 3 }}>
            {isEdit ? 'Update Volume Mount' : 'Create a Volume Mount'}
          </Typography>

          {step === 0 && (
            <>
              <RequiredLabel>Volume Name</RequiredLabel>
              <TextField fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setNameTouched(true)} error={nameTouched && !!nameError} helperText={(nameTouched && nameError) || ' '} sx={{ ...requiredSx, mb: 2 }} />

              <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mb: 3 }}>
                {VOLUME_TYPE_CARDS.map((card) => (
                  <VolumeTypeCard key={card.value} title={card.title} description={card.description} selected={formType === card.value} disabled={card.pdpOnly && !ctx.isPDP} onSelect={() => setFormType(card.value)} />
                ))}
              </Stack>

              {isPvc && (
                <Stack gap={2} sx={{ mb: 3, maxWidth: 560 }}>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      Storage Class
                    </Typography>
                    <Select size="small" fullWidth displayEmpty value={storageClassName} onChange={(e) => setStorageClassName(e.target.value)}>
                      <MenuItem value="" disabled>
                        Select a storage class
                      </MenuItem>
                      {storageClasses.map((sc) => (
                        <MenuItem key={sc.name} value={sc.name}>
                          {sc.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      Storage Capacity ({capacityGi} Gi)
                    </Typography>
                    <Slider value={capacityGi} min={PVC_CAPACITY_MIN_GI} max={PVC_CAPACITY_MAX_GI} onChange={(_e, v) => setCapacityGi(v as number)} valueLabelDisplay="auto" />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      Access Mode
                    </Typography>
                    <FormGroup row>
                      {VOLUME_ACCESS_MODES.map((m) => (
                        <FormControlLabel key={m} control={<Checkbox size="small" checked={accessModes.includes(m)} onChange={() => toggleAccessMode(m)} />} label={m} />
                      ))}
                    </FormGroup>
                  </Box>
                </Stack>
              )}

              {memoryWarning && (
                <Alert severity="info" icon={<Info size={18} />} sx={{ mb: 3 }}>
                  Storage capacity for this volume will count against the container&apos;s memory limit. Please note that containers will be forcefully restarted if memory limits are exceeded.
                </Alert>
              )}

              <Stack direction="row" gap={1.5}>
                <Button variant="outlined" onClick={onBack}>
                  Back
                </Button>
                <Button variant="contained" disabled={!step1Valid} onClick={() => setStep(1)}>
                  Next
                </Button>
              </Stack>
            </>
          )}

          {step === 1 && (
            <>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2.5, mb: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Add a new mount
                </Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      Container
                    </Typography>
                    <Select size="small" fullWidth disabled value={ctx.containerId}>
                      <MenuItem value={ctx.containerId}>{ctx.containerName}</MenuItem>
                    </Select>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <RequiredLabel>Mount Path</RequiredLabel>
                    <TextField
                      size="small"
                      fullWidth
                      value={mountPath}
                      onChange={(e) => setMountPath(e.target.value)}
                      onBlur={() => setMountTouched(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addMount();
                      }}
                      placeholder="/data"
                      error={mountTouched && !!mountPath && !!mountError}
                      helperText={(mountTouched && !!mountPath && mountError) || ' '}
                      sx={requiredSx}
                    />
                  </Box>
                </Stack>
                <Button startIcon={<Plus size={16} />} disabled={!canAddMount} onClick={addMount} sx={{ mt: 1 }}>
                  Add mount
                </Button>
              </Box>

              {drafts.length > 0 && (
                <ListingTable.Container sx={{ mb: 3 }}>
                  <ListingTable size="small">
                    <ListingTable.Head>
                      <ListingTable.Row>
                        <ListingTable.Cell>Container</ListingTable.Cell>
                        <ListingTable.Cell>Mount Path</ListingTable.Cell>
                        <ListingTable.Cell align="right">Actions</ListingTable.Cell>
                      </ListingTable.Row>
                    </ListingTable.Head>
                    <ListingTable.Body>
                      {drafts.map((draft) => (
                        <ListingTable.Row key={draft.id}>
                          <ListingTable.Cell>{ctx.containerName}</ListingTable.Cell>
                          <ListingTable.Cell sx={{ fontFamily: 'monospace' }}>{draft.mountPath}</ListingTable.Cell>
                          <ListingTable.Cell align="right">
                            <Tooltip title="Edit">
                              <IconButton size="small" aria-label="Edit mount" onClick={() => editMount(draft)}>
                                <Pencil size={15} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove">
                              <IconButton size="small" color="error" aria-label="Remove mount" onClick={() => removeMount(draft)}>
                                <Trash2 size={15} />
                              </IconButton>
                            </Tooltip>
                          </ListingTable.Cell>
                        </ListingTable.Row>
                      ))}
                    </ListingTable.Body>
                  </ListingTable>
                </ListingTable.Container>
              )}

              <Stack direction="row" gap={1.5}>
                {!isEdit && (
                  <Button variant="outlined" onClick={() => setStep(0)} disabled={submitting}>
                    Back
                  </Button>
                )}
                <Button variant="contained" disabled={!canSave} onClick={save} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}>
                  {submitting ? 'Saving…' : 'Save'}
                </Button>
              </Stack>
            </>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
