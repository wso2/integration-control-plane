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
import type { JSX } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { answerMarkdownSx } from '../styles';

/** A link the model wrote opens in a new tab, away from the console. */
function AnswerLink({ href, children, node: _node, ...props }: JSX.IntrinsicElements['a'] & ExtraProps): JSX.Element {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

const components: Components = { a: AnswerLink };

/**
 * An answer rendered from the model's Markdown. The model wrote it, so it is untrusted: raw HTML is dropped, and
 * links keep only safe addresses (react-markdown's default URL check).
 */
export default function AnswerMarkdown({ answer }: { answer: string }): JSX.Element {
  return (
    <Box sx={answerMarkdownSx}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {answer}
      </ReactMarkdown>
    </Box>
  );
}
