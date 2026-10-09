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

import { Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useCreateIdentityProvider, useUpdateIdentityProvider } from '../../../hooks/useAppSecurity';
import { useAllEnvironments } from '../../../../hooks/useEnvironments';
import type { IdentityProvider, IdentityProviderRequest } from '../../../../types/appSecurity';
import IdpLogo from './IdpLogo';

const NAME_MAX = 100;
const DESC_MAX = 254;

const isValidUrl = (v: string): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

function StepBar({ step }: { step: number }): JSX.Element {
  return (
    <Stack direction="row" gap={1.5} sx={{ mb: 3 }}>
      {[0, 1].map((i) => (
        <Box key={i} sx={{ flex: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: i === step ? 'primary.main' : 'text.secondary' }}>
            {i + 1}
          </Typography>
          <Box sx={{ height: 4, borderRadius: 2, mt: 0.5, bgcolor: i <= step ? 'primary.main' : 'action.selected' }} />
        </Box>
      ))}
    </Stack>
  );
}

interface RegisterIdpDialogProps {
  type: string;
  existing?: IdentityProvider;
  onClose: () => void;
  onSaved: (name: string) => void;
  onError: (message: string) => void;
}

/** Two-step wizard to register/edit an external identity provider. */
export default function RegisterIdpDialog({ type, existing, onClose, onSaved, onError }: RegisterIdpDialogProps): JSX.Element {
  const create = useCreateIdentityProvider();
  const update = useUpdateIdentityProvider();
  const { data: environments = [] } = useAllEnvironments();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [wellKnownEndpoint, setWellKnownEndpoint] = useState(existing?.wellKnownEndpoint ?? '');
  const [applyAllEnvs, setApplyAllEnvs] = useState(true);
  const [selectedEnvs, setSelectedEnvs] = useState<{ id: string; name: string }[]>([]);
  const [issuer, setIssuer] = useState(existing?.issuer ?? '');
  const [tokenEndpoint, setTokenEndpoint] = useState(existing?.tokenEndpoint ?? '');
  const [authorizeEndpoint, setAuthorizeEndpoint] = useState(existing?.authorizeEndpoint ?? '');
  const [jwksEndpoint, setJwksEndpoint] = useState(existing?.jwksEndpoint ?? '');
  const [alias, setAlias] = useState(existing?.alias ?? '');

  const saving = create.isPending || update.isPending;
  const wellKnownError = wellKnownEndpoint.trim() && !isValidUrl(wellKnownEndpoint.trim()) ? 'Well-Known URL should be a valid URL.' : '';
  const jwksError = jwksEndpoint.trim() && !isValidUrl(jwksEndpoint.trim()) ? 'JWKS Endpoint should be a valid URL.' : '';
  const step1Valid = name.trim().length > 0 && (applyAllEnvs || selectedEnvs.length > 0) && !wellKnownError;
  const canSave = useMemo(() => step1Valid && issuer.trim().length > 0 && !jwksError && !saving, [step1Valid, issuer, jwksError, saving]);

  const handleSave = () => {
    const input: IdentityProviderRequest = {
      name: name.trim(),
      type,
      description: description.trim(),
      enabled: existing?.enabled ?? true,
      tokenType: existing?.tokenType ?? 'DIRECT',
      issuer: issuer.trim(),
      ...(wellKnownEndpoint.trim() ? { wellKnownEndpoint: wellKnownEndpoint.trim() } : {}),
      ...(tokenEndpoint.trim() ? { tokenEndpoint: tokenEndpoint.trim() } : {}),
      ...(authorizeEndpoint.trim() ? { authorizeEndpoint: authorizeEndpoint.trim() } : {}),
      ...(jwksEndpoint.trim() ? { jwksEndpoint: jwksEndpoint.trim() } : {}),
      ...(alias.trim() ? { alias: alias.trim() } : {}),
      ...(existing?.certificates ? { certificates: existing.certificates } : {}),
      ...(existing?.additionalProperties ? { additionalProperties: existing.additionalProperties } : {}),
    };
    const handlers = {
      onSuccess: () => {
        onClose();
        onSaved(input.name);
      },
      // Keep the dialog open on failure so the user can correct and retry.
      onError: (e: Error) => onError(e.message || 'Failed to save the identity provider.'),
    };
    if (existing) update.mutate({ id: existing.id, input }, handlers);
    else create.mutate(input, handlers);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
        <X size={18} />
      </IconButton>
      <DialogContent sx={{ pt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <IdpLogo type={type} height={44} />
        </Box>
        <Alert severity="info" icon={false} sx={{ mb: 3, justifyContent: 'center' }}>
          Read more about registering an IDP in our documentation.
        </Alert>
        <StepBar step={step} />

        {step === 0 ? (
          <Stack gap={2.5}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              fullWidth
              required
              helperText={`${name.length}/${NAME_MAX}`}
              FormHelperTextProps={{ sx: { textAlign: 'right', mr: 0 } }}
              sx={{ '& .MuiFormLabel-asterisk': { color: 'error.main' } }}
            />
            <TextField
              label="Description (Optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
              fullWidth
              helperText={`${description.length}/${DESC_MAX}`}
              FormHelperTextProps={{ sx: { textAlign: 'right', mr: 0 } }}
            />
            <TextField
              label="Well-Known URL"
              value={wellKnownEndpoint}
              onChange={(e) => setWellKnownEndpoint(e.target.value)}
              fullWidth
              placeholder="https://idp.example.com/.well-known/openid-configuration"
              error={!!wellKnownError}
              helperText={wellKnownError || undefined}
            />
            <FormControlLabel control={<Checkbox checked={applyAllEnvs} onChange={(e) => setApplyAllEnvs(e.target.checked)} />} label="Apply to all environments" />
            {!applyAllEnvs && (
              <Autocomplete
                multiple
                options={environments}
                value={selectedEnvs}
                onChange={(_, v) => setSelectedEnvs(v)}
                getOptionLabel={(e) => e.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => <TextField {...params} label="Environments" placeholder="Environments" />}
              />
            )}
          </Stack>
        ) : (
          <Stack gap={2.5}>
            <TextField label="Issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} fullWidth required sx={{ '& .MuiFormLabel-asterisk': { color: 'error.main' } }} />
            <TextField label="Token Endpoint" value={tokenEndpoint} onChange={(e) => setTokenEndpoint(e.target.value)} fullWidth />
            <TextField label="Authorize Endpoint" value={authorizeEndpoint} onChange={(e) => setAuthorizeEndpoint(e.target.value)} fullWidth />
            <TextField label="JWKS Endpoint" value={jwksEndpoint} onChange={(e) => setJwksEndpoint(e.target.value)} fullWidth error={!!jwksError} helperText={jwksError || undefined} />
            <TextField label="Allowed Token Audience (Alias)" value={alias} onChange={(e) => setAlias(e.target.value)} fullWidth />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {step === 0 ? (
          <>
            <Button onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="contained" onClick={() => setStep(1)} disabled={!step1Valid}>
              Next
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep(0)} disabled={saving}>
              Back
            </Button>
            <Button variant="contained" onClick={handleSave} disabled={!canSave} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {saving ? 'Saving…' : existing ? 'Save Changes' : 'Create'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
