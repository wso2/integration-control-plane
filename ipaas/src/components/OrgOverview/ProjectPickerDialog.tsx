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

import { useState, type JSX } from 'react';
import { Box, Button, Dialog, DialogContent, IconButton, MenuItem, TextField, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import type { Project } from '../../types/project';
import * as styles from './dialogs.styles';

interface ProjectPickerDialogProps {
  open: boolean;
  /** Most recently opened first; the first one is preselected. */
  projects: Project[];
  onClose: () => void;
  onSelect: (project: Project) => void;
}

export default function ProjectPickerDialog({ open, projects, onClose, onSelect }: ProjectPickerDialogProps): JSX.Element {
  const [picked, setPicked] = useState('');
  const selected = projects.find((p) => p.id === picked) ?? projects[0];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogContent>
        <Box sx={styles.dialogHeader}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Choose a project
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The integration will be created in this project.
            </Typography>
          </Box>
          <IconButton aria-label="Close" onClick={onClose} sx={styles.closeButton}>
            <X size={16} />
          </IconButton>
        </Box>
        <TextField select label="Project" labelPlacement="top" value={selected?.id ?? ''} onChange={(e) => setPicked(e.target.value)} fullWidth sx={{ mt: 3 }}>
          {projects.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={styles.pickerActions}>
          <Button variant="contained" disabled={!selected} onClick={() => selected && onSelect(selected)}>
            Continue
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
