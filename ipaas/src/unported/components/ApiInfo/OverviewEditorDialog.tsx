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

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@wso2/oxygen-ui';
import { useEffect, useState, type JSX } from 'react';
import MarkdownEditorPane from '../MarkdownEditorPane';

interface OverviewEditorDialogProps {
  open: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

export default function OverviewEditorDialog({ open, value, onClose, onConfirm }: OverviewEditorDialogProps): JSX.Element {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ pb: 0.5 }}>Overview</DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Provide the content for the marketplace overview section using <strong>Markdown</strong> formatting.
        </Typography>
        <MarkdownEditorPane value={draft} onChange={setDraft} height={480} theme="vs" />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => onConfirm(draft)}>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
