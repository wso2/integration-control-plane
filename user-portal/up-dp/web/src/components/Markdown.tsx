/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
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
