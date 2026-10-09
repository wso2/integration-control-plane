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

import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@wso2/oxygen-ui';
import MonacoEditor from '@monaco-editor/react';
import { useEffect, useState, type JSX } from 'react';

interface RulesetEditorProps {
  open: boolean;
  fileContent: string;
  onFileContentChange: (value: string) => void;
  onClose: () => void;
  readOnly: boolean;
}

/**
 * Modal Monaco editor for a Spectral ruleset's raw YAML/JSON content.
 * The draft is local until Save, which pushes it back to the parent form.
 */
export default function RulesetEditor({ open, fileContent, onFileContentChange, onClose, readOnly }: RulesetEditorProps): JSX.Element {
  const [draft, setDraft] = useState(fileContent);

  useEffect(() => {
    if (open) setDraft(fileContent);
  }, [open, fileContent]);

  const handleSave = () => {
    onFileContentChange(draft);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{readOnly ? 'View Ruleset' : 'Edit Ruleset'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {readOnly ? 'Ruleset content.' : 'Edit the content below to customize the ruleset.'}
        </Typography>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', height: 450 }}>
          <MonacoEditor
            height="100%"
            language="yaml"
            theme="vs"
            value={draft}
            onChange={(val) => setDraft(val ?? '')}
            options={{
              readOnly,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              fontSize: 13,
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        {!readOnly && (
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
