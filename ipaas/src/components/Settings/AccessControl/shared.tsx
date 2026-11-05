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

import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@wso2/oxygen-ui';
import { type JSX, type ReactNode } from 'react';

export function Loading(): JSX.Element {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress />
    </Box>
  );
}

export function FormDialog({
  open,
  onClose,
  title,
  maxWidth = 'xs',
  primaryLabel,
  primaryDisabled,
  onPrimary,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: 'xs' | 'sm';
  primaryLabel: string;
  primaryDisabled: boolean;
  onPrimary: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 1 }}>
          {children}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={primaryDisabled} onClick={onPrimary}>
          {primaryLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
