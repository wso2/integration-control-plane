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

import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useIdentityProvider } from '../../../hooks/useAppSecurity';
import type { IdentityProvider } from '../../../../types/appSecurity';
import IdpLogo from './IdpLogo';

function Field({ label, value }: { label: string; value?: string }): JSX.Element {
  return (
    <Stack direction="row" sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 220, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
        {value || '—'}
      </Typography>
    </Stack>
  );
}

/** Read-only details of an identity provider, shown when a row is clicked. */
export default function IdpDetailModal({ idp, displayName, onClose }: { idp: IdentityProvider; displayName: string; onClose: () => void }): JSX.Element {
  const { data: detail, isLoading } = useIdentityProvider(idp.id);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
        <X size={18} />
      </IconButton>
      <DialogContent sx={{ pt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
          <IdpLogo type={idp.type} height={44} />
        </Box>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack>
            <Field label="Name" value={displayName} />
            <Field label="Description" value={detail?.description} />
            <Field label="Allowed Token Audience" value={detail?.alias} />
            <Field label="Well-Known URL" value={detail?.wellKnownEndpoint} />
            <Field label="Issuer" value={detail?.issuer} />
            <Field label="Token Endpoint" value={detail?.tokenEndpoint} />
            <Field label="JWKS Endpoint" value={detail?.jwksEndpoint} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
