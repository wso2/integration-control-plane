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

import { Box, ButtonBase, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { answerSentences } from '../../../utils/contextEngine';
import { citationMarkSx, litSentenceSx } from '../styles';

/** A citation someone is pointing at: its evidence number and, from the answer, the sentence it sits in. */
export interface CitationFocus {
  n: number;
  /** Index into the answer's sentences; absent when the passage itself is pointed at, which lights every sentence citing it. */
  sentence?: number;
}

interface CitedAnswerProps {
  answer: string;
  /** The citation being hovered or focused, if any. */
  active: CitationFocus | null;
  /** The citation pinned by a click, if any. */
  pinned: CitationFocus | null;
  onHover: (focus: CitationFocus | null) => void;
  onPin: (focus: CitationFocus) => void;
}

const matches = (focus: CitationFocus | null, n: number, sentence: number): boolean => !!focus && focus.n === n && (focus.sentence === undefined || focus.sentence === sentence);

/**
 * An answer with its `[n]` citations as small numbered marks. Pointing at a
 * mark lights the sentence it supports; the matching passage lights in the
 * evidence rail beside the answer. Clicking a mark pins it. Nothing pops up
 * over the text.
 */
export default function CitedAnswer({ answer, active, pinned, onHover, onPin }: CitedAnswerProps): JSX.Element {
  const sentences = answerSentences(answer);
  return (
    <Typography variant="body1" component="div" sx={{ lineHeight: 1.75 }}>
      {sentences.map((s, i) => {
        const lit = s.cites.some((n) => matches(active, n, i) || matches(pinned, n, i));
        // Marks sit at the end of the sentence's words, before any line break that follows it.
        const [, body, tail] = /^([\s\S]*?)(\s*)$/.exec(s.text) ?? [s.text, s.text, ''];
        return (
          <Box key={i} component="span">
            <Box component="span" sx={lit ? litSentenceSx : undefined}>
              {/* The markers came out of the text, so a stop that followed one closes up to the word before it. */}
              <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
                {body.replace(/ +([.!?,;:])/g, '$1')}
              </Box>
              {s.cites.map((n) => {
                const isPinned = matches(pinned, n, i);
                return (
                  <ButtonBase
                    key={n}
                    aria-label={`Evidence ${n}`}
                    aria-pressed={isPinned}
                    onMouseEnter={() => onHover({ n, sentence: i })}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover({ n, sentence: i })}
                    onBlur={() => onHover(null)}
                    onClick={() => onPin({ n, sentence: i })}
                    sx={citationMarkSx(matches(active, n, i) || isPinned, isPinned)}>
                    {n}
                  </ButtonBase>
                );
              })}
            </Box>
            <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
              {tail}
            </Box>
          </Box>
        );
      })}
    </Typography>
  );
}
