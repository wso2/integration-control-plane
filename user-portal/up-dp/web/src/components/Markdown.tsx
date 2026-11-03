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

import { Box } from '@wso2/oxygen-ui';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const markdownSx = {
  fontSize: 14,
  lineHeight: 1.6,
  wordBreak: 'break-word',
  '& p': { my: 0.75 },
  '& p:first-of-type': { mt: 0 },
  '& p:last-of-type': { mb: 0 },
  '& ul, & ol': { my: 0.75, pl: 3 },
  '& code': { fontFamily: 'monospace', fontSize: 12.5, bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 },
  '& pre': { bgcolor: 'action.hover', p: 1.5, borderRadius: 1, overflow: 'auto' },
  '& pre code': { bgcolor: 'transparent', p: 0 },
  '& table': { borderCollapse: 'collapse', my: 1 },
  '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5 },
  '& a': { color: 'primary.main' },
} as const;

/** An agent's answer, which is usually markdown. Raw HTML is not rendered. */
export default function Markdown({ children }: { children: string }) {
  return (
    <Box sx={markdownSx}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </Box>
  );
}
