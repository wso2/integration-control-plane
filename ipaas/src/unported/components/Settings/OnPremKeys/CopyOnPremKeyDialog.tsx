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

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';

/** Shows a freshly generated on-prem key once; the value is never retrievable again. */
export default function CopyOnPremKeyDialog({ keyValue, onClose }: { keyValue: string; onClose: () => void }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(keyValue).then(
      () => {
        setCopyError(null);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopyError('Failed to copy the key. Please copy it manually.'),
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>On-Premises Key</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>Please copy this on-premises key now — it will not be visible once this dialog is closed.</Typography>
        <Stack direction="row" alignItems="center" gap={1} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 600, flex: 1, wordBreak: 'break-all' }}>
            {keyValue}
          </Typography>
          <Button size="small" variant="outlined" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Stack>
        {copyError && (
          <Alert severity="error" onClose={() => setCopyError(null)} sx={{ mt: 1 }}>
            {copyError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
