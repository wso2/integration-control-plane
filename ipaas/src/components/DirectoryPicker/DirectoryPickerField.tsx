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

import { CircularProgress, IconButton, InputAdornment, Tooltip, TextField } from '@wso2/oxygen-ui';
import { Folder, Edit } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import type { RepoTreeNode } from '../../types/repository';
import DirectoryPickerDialog from './DirectoryPickerDialog';

interface DirectoryPickerFieldProps {
  repo: string;
  value: string;
  onChange: (path: string) => void;
  statusIcon?: React.ReactNode;
  isValidating?: boolean;
  isError?: boolean | string;
  contents: RepoTreeNode[];
  isFetching: boolean;
  onRefetch: () => void;
  disabled?: boolean;
  /** Keeps an empty line under the field for an error to appear in; off where something else sits directly below. */
  reserveErrorSpace?: boolean;
}

export default function DirectoryPickerField({ repo, value, onChange, statusIcon, isValidating = false, isError = false, contents, isFetching, onRefetch, disabled = false, reserveErrorSpace = true }: DirectoryPickerFieldProps): JSX.Element {
  const [open, setOpen] = useState(false);

  const helperText = typeof isError === 'string' && !isValidating ? isError : undefined;

  return (
    <>
      <TextField
        labelPlacement="top"
        label="Repository Sub Path"
        optional
        value={value}
        fullWidth
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        slotProps={{
          input: {
            readOnly: true,
            startAdornment: statusIcon ? (
              <InputAdornment position="start">{statusIcon}</InputAdornment>
            ) : (
              <InputAdornment position="start">
                <Folder size={18} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {isValidating || isFetching ? (
                  <CircularProgress size={14} />
                ) : (
                  <Tooltip title="Edit path" placement="top">
                    <IconButton
                      size="small"
                      aria-label="Edit path"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!disabled) setOpen(true);
                      }}
                      disabled={disabled}
                      sx={{ color: 'primary.main' }}>
                      <Edit size={14} />
                    </IconButton>
                  </Tooltip>
                )}
              </InputAdornment>
            ),
          },
        }}
        error={!!isError && !isValidating ? true : reserveErrorSpace ? false : undefined}
        helperText={helperText}
        sx={{ cursor: disabled ? 'default' : 'pointer' }}
      />

      <DirectoryPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        onSave={(path) => {
          onChange(path);
        }}
        repoName={repo}
        contents={contents}
        isFetching={isFetching}
        onRefetch={onRefetch}
        currentValue={value}
      />
    </>
  );
}
