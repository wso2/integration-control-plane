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

import { Button, CircularProgress, MenuItem, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { useState, type JSX } from 'react';
import MarkdownEditorPane from '../MarkdownEditorPane';

const DOC_TYPES = [
  { value: 'HOWTO', label: 'How To' },
  { value: 'SAMPLES', label: 'Sample and SDK' },
  { value: 'PUBLIC_FORUM', label: 'Public Forum' },
  { value: 'SUPPORT_FORUM', label: 'Support Forum' },
  { value: 'OTHER', label: 'Other' },
];

export interface DocFormPageProps {
  view: 'create' | 'edit';
  initialName: string;
  initialType: string;
  initialOtherType: string;
  initialContent: string;
  initialSourceType?: string;
  saving: boolean;
  onBack: () => void;
  onSave: (name: string, type: string, otherType: string, content: string, sourceType: string) => void;
}

export default function DocFormPage({ view, initialName, initialType, initialOtherType, initialContent, initialSourceType = 'MARKDOWN', saving, onBack, onSave }: DocFormPageProps): JSX.Element {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState(initialType);
  const [otherType, setOtherType] = useState(initialOtherType);
  const PLACEHOLDER = '# Enter document content';
  const [content, setContent] = useState(initialContent || PLACEHOLDER);
  const isCreate = view === 'create';
  const isValid = name.trim() !== '' && (type !== 'OTHER' || otherType.trim() !== '');

  return (
    <PageContent>
      <Typography variant="h1" sx={{ mb: 3 }}>
        {isCreate ? 'Create Developer Document' : 'Edit Developer Document'}
      </Typography>

      <Stack direction="row" gap={2} sx={{ mb: 2 }}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter document name here" required size="small" sx={{ width: 280, '& .MuiFormLabel-asterisk': { color: 'error.main' } }} />
        <TextField select label="Document Type" size="small" sx={{ width: 220 }} value={type} onChange={(e) => setType(e.target.value as string)}>
          {DOC_TYPES.map((t) => (
            <MenuItem key={t.value} value={t.value}>
              {t.label}
            </MenuItem>
          ))}
        </TextField>
        {type === 'OTHER' && <TextField label="Custom Document Type" value={otherType} onChange={(e) => setOtherType(e.target.value)} placeholder="Enter custom document type here" required size="small" sx={{ width: 260 }} />}
      </Stack>

      <MarkdownEditorPane key={isCreate ? 'new' : initialName} value={content} onChange={setContent} height={500} theme="vs-dark" placeholderValue={PLACEHOLDER} />

      <Stack direction="row" gap={1} sx={{ mt: 3 }}>
        <Button variant="outlined" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button
          variant="contained"
          onClick={() => onSave(name.trim(), type, otherType.trim(), content === PLACEHOLDER ? '' : content, initialSourceType)}
          disabled={!isValid || saving}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {saving ? 'Saving...' : isCreate ? 'Create' : 'Save'}
        </Button>
      </Stack>
    </PageContent>
  );
}
