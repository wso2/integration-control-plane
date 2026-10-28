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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState } from 'react';
import { useUpdateApimApi } from '../../../hooks/useApim';
import type { ApimApiInfo } from '../../../types/apim';
import { useThrottlingPolicies } from '../../../hooks/useMarketplace';

interface ActivatePlansDialogProps {
  open: boolean;
  onClose: () => void;
  apimId: string;
  apimApiInfo: ApimApiInfo;
}

export default function ActivatePlansDialog({ open, onClose, apimId, apimApiInfo }: ActivatePlansDialogProps) {
  const { data: policies = [], isLoading: loadingPolicies } = useThrottlingPolicies();
  const updateApimMutation = useUpdateApimApi();

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [showError, setShowError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initialise toggles from current active policies whenever dialog opens
  useEffect(() => {
    if (!open) return;
    const active = apimApiInfo.policies ?? [];
    const init: Record<string, boolean> = {};
    policies.forEach((p) => {
      init[p.name] = active.includes(p.name);
    });
    setChecked(init);
    setShowError(false);
  }, [open, policies, apimApiInfo.policies]);

  const handleToggle = (name: string) => {
    setChecked((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      setShowError(!Object.values(next).some(Boolean));
      return next;
    });
  };

  const handleSave = async () => {
    const selectedPolicies = Object.entries(checked)
      .filter(([, on]) => on)
      .map(([name]) => name);

    if (selectedPolicies.length === 0) {
      setShowError(true);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await updateApimMutation.mutateAsync({ apimId, body: { ...apimApiInfo, policies: selectedPolicies } });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save subscription plans. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setShowError(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h5">Manage Subscription Plans</Typography>
          <IconButton size="small" aria-label="close" onClick={handleClose}>
            <X size={16} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ p: 0 }}>
        {loadingPolicies ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {policies.map((policy) => (
              <Box
                key={policy.name}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 3,
                  py: 1.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}>
                <Typography variant="body1" fontWeight={500}>
                  {policy.name}
                </Typography>
                <FormControlLabel control={<Switch checked={!!checked[policy.name]} onChange={() => handleToggle(policy.name)} color="primary" size="small" inputProps={{ 'aria-label': policy.name }} />} label="" sx={{ m: 0 }} />
              </Box>
            ))}
            {showError && (
              <Box sx={{ px: 3, pt: 2 }}>
                <Alert severity="error">Please select at least one subscription plan.</Alert>
              </Box>
            )}
            {saveError && (
              <Box sx={{ px: 3, pt: 2 }}>
                <Alert severity="error">{saveError}</Alert>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || loadingPolicies || showError} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
