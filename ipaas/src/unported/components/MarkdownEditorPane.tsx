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

import { Box, CircularProgress, Divider, Typography } from '@wso2/oxygen-ui';
import MonacoEditor from '@monaco-editor/react';
import { Suspense, type JSX } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownEditorPaneProps {
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
  theme?: 'vs' | 'vs-dark';
  placeholderValue?: string;
}

const PREVIEW_SX = {
  flex: 1,
  minWidth: 0,
  p: 2,
  overflowY: 'auto' as const,
  '& h1,& h2,& h3,& h4': { mt: 1, mb: 0.5 },
  '& p': { mt: 0, mb: 1 },
  '& ul,& ol': { pl: 2.5 },
  '& code': { fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 },
  '& pre': { bgcolor: 'action.hover', p: 1.5, borderRadius: 1, overflow: 'auto' },
  '& a': { color: 'primary.main' },
};

const HEADER_SX = {
  px: 1.5,
  py: 0.75,
  bgcolor: 'action.hover',
  borderBottom: '1px solid',
  borderColor: 'divider',
  fontWeight: 600,
  color: 'text.secondary',
};

export default function MarkdownEditorPane({ value, onChange, height = 480, theme = 'vs', placeholderValue }: MarkdownEditorPaneProps): JSX.Element {
  const h = typeof height === 'number' ? `${height}px` : height;

  return (
    <Box sx={{ display: 'flex', border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', height: h }}>
      {/* Editor side */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="caption" sx={HEADER_SX}>
          Edit
        </Typography>
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <Suspense
            fallback={
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', bgcolor: theme === 'vs-dark' ? '#1e1e1e' : undefined }}>
                <CircularProgress size={24} color={theme === 'vs-dark' ? 'inherit' : 'primary'} sx={theme === 'vs-dark' ? { color: '#fff' } : undefined} />
              </Box>
            }>
            <MonacoEditor
              height="100%"
              language="markdown"
              theme={theme}
              value={value}
              onChange={(v) => onChange(v ?? '')}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
                quickSuggestions: false,
                acceptSuggestionOnCommitCharacter: false,
                fontSize: 13,
              }}
            />
          </Suspense>
        </Box>
      </Box>

      <Divider orientation="vertical" flexItem />

      {/* Preview side */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="caption" sx={HEADER_SX}>
          Preview
        </Typography>
        <Box sx={PREVIEW_SX}>
          {value && value !== placeholderValue ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <Typography variant="body1" color="text.disabled">
              {placeholderValue ? placeholderValue.replace(/^#+\s*/, '') : 'Nothing to preview'}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
