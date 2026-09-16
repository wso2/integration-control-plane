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

import { Alert, Box, Button, Card, CircularProgress, Drawer, IconButton, InputAdornment, Link, Skeleton, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowUpRight, CheckCircle2, Lock, X } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS, BALLERINA_CENTRAL_TOKEN_PANEL_COPY as PANEL_COPY } from '../../constants/packageRegistries';
import { useBallerinaCentralToken, useSaveBallerinaCentralToken } from '../../hooks/useBallerinaCentralToken';
import { formatDateTime } from '../../utils/time';

interface BallerinaCentralTokenDrawerProps {
  open: boolean;
  onClose: () => void;
  tokenInput: string;
  onTokenInputChange: (value: string) => void;
}

export default function BallerinaCentralTokenDrawer({ open, onClose, tokenInput, onTokenInputChange }: BallerinaCentralTokenDrawerProps): JSX.Element {
  const { data: tokenStatus, isLoading } = useBallerinaCentralToken();
  const saveToken = useSaveBallerinaCentralToken();
  const [error, setError] = useState<string | null>(null);

  const configured = !!tokenStatus?.configured;

  const handleClose = () => {
    setError(null);
    onTokenInputChange('');
    onClose();
  };

  const handleSave = () => {
    if (!tokenInput.trim()) return;
    setError(null);
    saveToken.mutate(tokenInput.trim(), {
      onSuccess: () => onTokenInputChange(''),
      onError: (err) => setError(err.message),
    });
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 480 },
          top: { xs: '56px', sm: '64px' },
          height: 'auto',
          bottom: 0,
        },
      }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5">{PANEL_COPY.heading}</Typography>
          <IconButton size="small" onClick={handleClose} aria-label="Close Ballerina Central access">
            <X size={16} />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
          {isLoading ? (
            <Skeleton variant="rounded" height={160} />
          ) : configured ? (
            <Stack gap={2}>
              <Alert severity="success">{PANEL_COPY.saveSuccessMessage}</Alert>

              <Card variant="outlined" sx={{ p: 2.5, borderRadius: 1 }}>
                <Stack direction="row" alignItems="center" gap={1} sx={{ color: 'success.main', mb: 2 }}>
                  <CheckCircle2 size={18} />
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

              <Alert severity="info">You can update this anytime from Settings &gt; Package Registries in your organization's home view.</Alert>
            </Stack>
          ) : (
            <Stack gap={2}>
              {error && <Alert severity="error">{error}</Alert>}

              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                <Stack gap={1.5}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS.heading}
                  </Typography>
                  <Stack component="ol" gap={1} sx={{ m: 0, pl: 2.5 }}>
                    {BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS.steps.map((step) => (
                      <Typography key={step} component="li" variant="body2">
                        {step}
                      </Typography>
                    ))}
                  </Stack>
                  <Link href={BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS.linkUrl} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 600, width: 'fit-content' }}>
                    {BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS.linkLabel} <ArrowUpRight size={16} />
                  </Link>
                </Stack>
              </Box>

              <Stack gap={1}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {PANEL_COPY.accessTokenLabel}
                </Typography>
                <TextField
                  fullWidth
                  type="password"
                  value={tokenInput}
                  onChange={(e) => onTokenInputChange(e.target.value)}
                  placeholder={PANEL_COPY.tokenPlaceholder}
                  disabled={saveToken.isPending}
                  slotProps={{ htmlInput: { 'aria-label': PANEL_COPY.accessTokenLabel } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Lock size={16} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Stack>

              <Alert severity="info">
                <Typography component="span" variant="body2">
                  {PANEL_COPY.infoMessage}
                </Typography>
              </Alert>
            </Stack>
          )}
        </Box>

        {/* Footer */}
        <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          {configured ? (
            <Button variant="contained" onClick={handleClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outlined" onClick={handleClose}>
                Close
              </Button>
              <Button variant="contained" disabled={!tokenInput.trim() || saveToken.isPending} onClick={handleSave} startIcon={saveToken.isPending ? <CircularProgress size={14} /> : undefined}>
                {PANEL_COPY.saveLabel}
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
