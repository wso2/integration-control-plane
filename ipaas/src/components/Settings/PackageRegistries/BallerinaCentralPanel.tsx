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

import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CircularProgress, InputAdornment, Link, Skeleton, Stack, Typography, TextField } from '@wso2/oxygen-ui';
import { ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, Lock } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { BALLERINA_CENTRAL_TOKEN_EXPIRY_WARNING_DAYS, BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS, BALLERINA_CENTRAL_TOKEN_PANEL_COPY } from '../../../constants/packageRegistries';
import { useBallerinaCentralToken, useRemoveBallerinaCentralToken, useSaveBallerinaCentralToken } from '../../../hooks/useBallerinaCentralToken';
import { formatDateTime } from '../../../utils/time';
import { useLeaveGuard, useUnsavedChanges } from '../../../contexts/UnsavedChangesContext';

function daysUntilExpiry(expiresOn?: string): number | null {
  if (!expiresOn) return null;
  const expiresAt = new Date(expiresOn).getTime();
  if (Number.isNaN(expiresAt)) return null;
  return Math.floor((expiresAt - Date.now()) / 86_400_000);
}

export default function BallerinaCentralPanel({ onBack }: { onBack: () => void }): JSX.Element {
  const can = useCan();
  const canRead = can(Scopes.PACKAGE_REGISTRY_READ);
  const canManage = can(Scopes.PACKAGE_REGISTRY_MANAGE);
  const { data: tokenStatus, isLoading, isError, refetch } = useBallerinaCentralToken();
  const saveToken = useSaveBallerinaCentralToken();
  const removeToken = useRemoveBallerinaCentralToken();
  const [tokenInput, setTokenInput] = useState('');
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const configured = !!tokenStatus?.configured;
  const daysToExpiry = daysUntilExpiry(tokenStatus?.expiresOn);
  const expiringSoon = daysToExpiry !== null && daysToExpiry <= BALLERINA_CENTRAL_TOKEN_EXPIRY_WARNING_DAYS;

  useUnsavedChanges(tokenInput !== '');
  const guardNavigation = useLeaveGuard();

  const handleSave = () => {
    if (!tokenInput.trim()) return;
    saveToken.mutate(tokenInput.trim(), {
      onSuccess: () => {
        setTokenInput('');
        setSaveSuccess(true);
      },
    });
  };

  return (
    <Box>
      <Button size="small" startIcon={<ArrowLeft size={14} />} onClick={() => guardNavigation(onBack)} sx={{ mb: 2 }}>
        Back to package registries
      </Button>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Ballerina Central
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {configured ? 'This token allows builds in the organization to access private packages when needed.' : 'Add a Ballerina Central access token to allow builds in this organization to access private packages.'}
      </Typography>

      {saveSuccess && (
        <Alert severity="success" onClose={() => setSaveSuccess(false)} sx={{ mb: 3, maxWidth: 640 }}>
          {BALLERINA_CENTRAL_TOKEN_PANEL_COPY.saveSuccessMessage}
        </Alert>
      )}

      {!canRead ? (
        <Alert severity="info" sx={{ maxWidth: 640 }}>
          Your role doesn&apos;t allow viewing or changing the Ballerina Central token.
        </Alert>
      ) : isLoading ? (
        <Skeleton variant="rounded" height={160} sx={{ maxWidth: 640 }} />
      ) : isError ? (
        <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
          Couldn&apos;t load the token status. Please try again.
        </Alert>
      ) : !configured ? (
        <Stack gap={3} sx={{ maxWidth: 640 }}>
          <Accordion expanded={instructionsOpen} onChange={(_e, expanded) => setInstructionsOpen(expanded)} disableGutters sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ChevronDown size={16} />}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS.heading}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack gap={3}>
                <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                  {BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS.steps.map((step) => (
                    <Typography key={step} component="li" variant="body2" sx={{ mb: 1 }}>
                      {step}
                    </Typography>
                  ))}
                </Box>
                <Link href={BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS.linkUrl} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 600, width: 'fit-content' }}>
                  {BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS.linkLabel} <ArrowUpRight size={16} />
                </Link>
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Stack gap={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Access token
            </Typography>
            <TextField
              fullWidth
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste your token here"
              disabled={saveToken.isPending || !canManage}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock size={16} />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>

          {saveToken.isError && <Alert severity="error">{saveToken.error.message}</Alert>}

          <Button variant="contained" disabled={!tokenInput.trim() || saveToken.isPending || !canManage} onClick={handleSave} startIcon={saveToken.isPending ? <CircularProgress size={14} /> : undefined} sx={{ alignSelf: 'flex-start' }}>
            Save token
          </Button>
        </Stack>
      ) : (
        <Stack gap={3} sx={{ maxWidth: 640 }}>
          <Card sx={{ p: 3, borderRadius: 2 }}>
            <Stack direction="row" alignItems="center" gap={1} sx={{ color: 'success.main', mb: 3 }}>
              <CheckCircle2 size={20} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'success.main' }}>
                Token configured
              </Typography>
            </Stack>
            <Stack direction="row">
              <Stack gap={0.5} sx={{ flex: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Added on
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {formatDateTime(tokenStatus?.addedOn)}
                </Typography>
              </Stack>
              {tokenStatus?.expiresOn && (
                <Stack gap={0.5} sx={{ flex: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Expires on
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {formatDateTime(tokenStatus.expiresOn)}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </Card>

          {expiringSoon && <Alert severity="warning">This token expires on {formatDateTime(tokenStatus?.expiresOn)}. Save a new token before then to avoid failed builds.</Alert>}

          {removeToken.isError && <Alert severity="error">{removeToken.error.message}</Alert>}

          <Stack direction="row" gap={1.5}>
            <Button
              variant="outlined"
              color="error"
              disabled={removeToken.isPending || !canManage}
              startIcon={removeToken.isPending ? <CircularProgress size={14} /> : undefined}
              onClick={() => removeToken.mutate(undefined, { onSuccess: () => setSaveSuccess(false) })}>
              Remove token
            </Button>
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
