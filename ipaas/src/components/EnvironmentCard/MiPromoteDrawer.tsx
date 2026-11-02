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

import { Alert, Box, Button, CircularProgress, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useMiConfig, usePromoteMi } from '../../hooks/useMiConfig';
import type { PromoteInput } from '../../types/deployment';
import type { MiConfig } from '../../types/envGroups';
import { MiPromoteConfigError, toMiConfigDraft, validateMiConfigDraft } from '../../utils/miConfigs';
import { generateUUID } from '../../utils/string';
import MiConfigEditor, { MiConfigEditorSkeleton, type MiConfigRow } from './MiConfigEditor';
import { bodySx, drawerSx, footerSx, headerSx } from './MiConfigEditor.styles';

interface MiPromoteDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  componentId: string;
  input: PromoteInput;
  onPromoteStarted?: () => void;
  onPromoteSettled?: () => void;
}

/**
 * The first promotion of an MI integration to an environment: its configuration is
 * copied from the source environment and written to the target (devant's
 * PromoteMiComponentWizard). Secret values cannot be read back, so each secret
 * needs a value for the target. Later promotions keep the target's configuration
 * and skip this drawer.
 */
export default function MiPromoteDrawer({ open, onClose, projectId, componentId, input, onPromoteStarted, onPromoteSettled }: MiPromoteDrawerProps): JSX.Element {
  const { data, isLoading, isError, refetch } = useMiConfig(projectId, componentId, input.sourceEnvironmentId, open);
  const promoteMi = usePromoteMi(projectId, componentId);
  const [envVars, setEnvVars] = useState<MiConfigRow[]>([]);
  const [secrets, setSecrets] = useState<MiConfigRow[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the promotion went through but a configuration write failed: a retry only writes.
  const [promoted, setPromoted] = useState(false);
  const seededRef = useRef(false);

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  const seed = (config: MiConfig) => {
    setEnvVars(config.envVars.map((e) => ({ id: generateUUID(), key: e.key, value: e.value })));
    setSecrets(config.secrets.map((key) => ({ id: generateUUID(), key, value: '' })));
    seededRef.current = true;
  };

  // Seed on open, or when data arrives after opening; never over the user's edits.
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    if (data && !seededRef.current) seed(data);
  }, [open, data]);

  // Reset on open only: a refetch of the source must not clear a failed write's error and retry state.
  useEffect(() => {
    if (!open) return;
    setShowErrors(false);
    setError(null);
    setPromoted(false);
  }, [open]);

  const draft = useMemo(() => toMiConfigDraft(envVars, secrets), [envVars, secrets]);
  // Nothing is stored in the target yet, so every secret needs a value.
  const errors = useMemo(() => validateMiConfigDraft(draft, []), [draft]);
  // Only after a Promote attempt: every copied secret starts without a value.
  const errorFor = (id: string): string => (showErrors ? (errors.get(id) ?? '') : '');

  const handlePromote = () => {
    setError(null);
    if (errors.size > 0) {
      setShowErrors(true);
      return;
    }
    onPromoteStarted?.();
    promoteMi.mutate(
      { input, draft, promoted },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          if (err instanceof MiPromoteConfigError) setPromoted(true);
          setError(err instanceof Error ? err.message : 'Failed to promote the integration.');
        },
        onSettled: onPromoteSettled,
      },
    );
  };

  const renderContent = () => {
    if (isLoading) return <MiConfigEditorSkeleton />;
    if (isError || !data) {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }>
          Could not load the configurations to copy.
        </Alert>
      );
    }
    return (
      <>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          These are copied from the current environment and set in the next one. Secret values are not copied: enter a value for each secret.
        </Typography>
        <MiConfigEditor envVars={envVars} secrets={secrets} onEnvVarsChange={setEnvVars} onSecretsChange={setSecrets} errorFor={errorFor} showErrorSummary={showErrors && errors.size > 0} />
      </>
    );
  };

  const promoteLabel = promoteMi.isPending ? (promoted ? 'Saving…' : 'Promoting…') : promoted ? 'Save Configurations' : 'Promote';

  return (
    <Drawer anchor="right" open={open} onClose={handleClose} variant="temporary" sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={headerSx}>
        <Typography variant="h5">Promote</Typography>
        <IconButton size="small" aria-label="close" onClick={handleClose}>
          <X size={16} />
        </IconButton>
      </Stack>

      <Box sx={bodySx}>{renderContent()}</Box>

      {error && (
        <Alert severity="error" sx={{ mx: 2, mb: 1 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" justifyContent="flex-end" gap={1} sx={footerSx}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handlePromote} disabled={!data || promoteMi.isPending} startIcon={promoteMi.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
          {promoteLabel}
        </Button>
      </Stack>
    </Drawer>
  );
}
