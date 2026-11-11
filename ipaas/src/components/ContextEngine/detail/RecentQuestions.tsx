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

import { Box, Button, ButtonBase, CircularProgress, Stack, Typography, Paper } from '@wso2/oxygen-ui';
import { History } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { askedQuestionMeta } from '../../../utils/contextEngine';
import { mutedSx, summaryCardSx } from '../styles';
import type { AskedQuestion } from '../../../types/contextEngine';

interface RecentQuestionsProps {
  questions: AskedQuestion[];
  /** The question on screen, highlighted. */
  selectedId?: string;
  /** The question being reopened, with a spinner. */
  openingId?: string;
  onOpen: (question: AskedQuestion) => void;
  /** Empty the list kept in this browser. */
  onClear?: () => void;
}

/**
 * Questions asked from this browser, newest first. Opening one asks the engine
 * for the stored query, which checks every passage again and hides an answer
 * whose sources the reader can no longer see.
 */
export default function RecentQuestions({ questions, selectedId, openingId, onOpen, onClear }: RecentQuestionsProps): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ ...summaryCardSx, height: 'auto', px: 1, py: 2, position: { lg: 'sticky' }, top: { lg: 16 } }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ px: 1.5 }}>
        <History size={18} aria-hidden />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
          Recent questions
        </Typography>
        {onClear && questions.length > 0 && (
          <Button size="small" variant="text" onClick={onClear} disabled={!!openingId} sx={{ minWidth: 0 }}>
            Clear list
          </Button>
        )}
      </Stack>
      {questions.length === 0 && (
        <Typography variant="body2" sx={{ ...mutedSx, px: 1.5, mt: 1.25 }}>
          Questions you ask appear here, so you can open them again.
        </Typography>
      )}
      {questions.length > 0 && (
        <Stack gap={0.25} sx={{ mt: 1.25 }} component="ul" style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
          {questions.map((q) => (
            <li key={q.queryId}>
              <ButtonBase
                onClick={() => onOpen(q)}
                disabled={!!openingId}
                aria-current={q.queryId === selectedId ? 'true' : undefined}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 1,
                  textAlign: 'left',
                  borderRadius: 1,
                  px: 1.5,
                  py: 1.25,
                  bgcolor: q.queryId === selectedId ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.4 }}>
                    {q.question}
                  </Typography>
                  <Typography variant="caption" sx={mutedSx}>
                    {askedQuestionMeta(q)}
                  </Typography>
                </Box>
                {openingId === q.queryId && <CircularProgress size={14} sx={{ mt: 0.5, flexShrink: 0 }} />}
              </ButtonBase>
            </li>
          ))}
        </Stack>
      )}
      <Typography variant="caption" component="p" sx={{ ...mutedSx, mx: 1.5, mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider', lineHeight: 1.5 }}>
        Only you see this list. It is kept in this browser.
      </Typography>
    </Paper>
  );
}
