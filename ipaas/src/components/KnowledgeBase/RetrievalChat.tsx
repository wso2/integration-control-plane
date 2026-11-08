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

import { Alert, Avatar, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, InputBase, ListingTable, Stack, TablePagination, Typography } from '@wso2/oxygen-ui';
import { Search, Send, User } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRetrieveFromKnowledgeBase } from '../../hooks/useKnowledgeBases';
import { DEFAULT_RETRIEVAL_QUERY } from '../../constants/ragIngestion';
import { httpStatusOf } from '../../utils/apiErrors';
import { retrievalAccessReason } from '../../utils/knowledgeBase';
import { generateUUID } from '../../utils/string';
import type { KnowledgeBase } from '../../types/knowledgeBase';
import type { RetrievedChunk } from '../../types/ragIngestion';

/** Inline chat shows only this many chunks; the rest open in a paginated modal. */
const PREVIEW_ROWS = 3;
const ROWS_PER_PAGE_OPTIONS = [5, 10, 20];

/** The Source/Text table used both inline (preview) and inside the "See all" modal. */
function ChunksTable({ chunks }: { chunks: RetrievedChunk[] }): ReactNode {
  return (
    <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <ListingTable size="small">
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell sx={{ width: '30%' }}>Source</ListingTable.Cell>
            <ListingTable.Cell>Text</ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {chunks.map((c, i) => (
            <ListingTable.Row key={`${c.source}-${i}`}>
              <ListingTable.Cell>
                <Typography variant="caption" sx={{ wordBreak: 'break-word' }}>
                  {c.source}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {c.text}
                </Typography>
              </ListingTable.Cell>
            </ListingTable.Row>
          ))}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}

/** Modal listing every retrieved chunk for one query, paginated. */
function ChunksModal({ chunks, onClose }: { chunks: RetrievedChunk[] | null; onClose: () => void }): ReactNode {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const open = chunks !== null;
  const safePage = chunks ? Math.min(page, Math.max(0, Math.ceil(chunks.length / rowsPerPage) - 1)) : 0;
  const paged = chunks ? chunks.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage) : [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth TransitionProps={{ onExited: () => setPage(0) }}>
      <DialogTitle>Retrieved Chunks ({chunks?.length ?? 0})</DialogTitle>
      <DialogContent>
        <ChunksTable chunks={paged} />
        <TablePagination
          component="div"
          count={chunks?.length ?? 0}
          page={safePage}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          onPageChange={(_e, p) => setPage(p)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface RetrievalChatProps {
  knowledgeBase: Pick<KnowledgeBase, 'name' | 'environment' | 'apiStatus'>;
  /** The integration the query is made from, sent as `rag_component_id`. */
  componentId: string;
  /** Why queries cannot be sent yet (e.g. the KB Service is still deploying); null when they can. */
  unavailableReason: string | null;
}

interface ChatEntry {
  id: string;
  query: string;
  chunks: RetrievedChunk[];
  isPending: boolean;
  error?: string;
}

function retrieveErrorMessage(err: unknown): string {
  const status = httpStatusOf(err);
  // The gateway answers 404 until the API reaches it, and 502/503 while the service starts.
  if (status === 404 || status === 502 || status === 503) return 'The knowledge base service is not ready yet. Try again in a moment.';
  if (status === 401 || status === 403) return 'The gateway refused the test key. Try again in a moment.';
  if (err instanceof DOMException && err.name === 'TimeoutError') return 'The knowledge base did not answer in time. Please try again.';
  // fetch rejects with a TypeError when the gateway can't be reached at all.
  if (err instanceof TypeError) return 'Could not reach the knowledge base on the API gateway. Please try again.';
  return 'Failed to retrieve chunks. Please try again.';
}

/**
 * A chat window that queries a knowledge base for the chunks most relevant to a
 * question. The query goes to the knowledge base's API on the API Platform gateway
 * with a test key, and its service embeds it with the knowledge base's own settings.
 */
export default function RetrievalChat({ knowledgeBase, componentId, unavailableReason: refusal }: RetrievalChatProps): ReactNode {
  // No key is minted while the service can't be queried anyway.
  const { retrieve, access } = useRetrieveFromKnowledgeBase(knowledgeBase, componentId, !refusal);
  const unavailableReason = refusal ?? retrievalAccessReason(access, knowledgeBase.apiStatus);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [modalChunks, setModalChunks] = useState<RetrievedChunk[] | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const isRetrieving = retrieve.isPending;

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, isRetrieving]);

  const canQuery = !unavailableReason;
  const canSend = canQuery && !isRetrieving;

  const send = () => {
    const query = input.trim();
    if (!query || !canSend) return;
    setInput('');
    const id = generateUUID();
    setMessages((prev) => [...prev, { id, query, chunks: [], isPending: true }]);
    retrieve.mutate(
      { userQuery: query, maxChunks: DEFAULT_RETRIEVAL_QUERY.maxChunks, minSimilarity: DEFAULT_RETRIEVAL_QUERY.minSimilarity },
      {
        onSuccess: (chunks) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isPending: false, chunks } : m))),
        onError: (err) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isPending: false, error: retrieveErrorMessage(err) } : m))),
      },
    );
  };

  return (
    <Stack gap={1.5} sx={{ width: '100%' }}>
      {unavailableReason && <Alert severity="info">{unavailableReason}</Alert>}

      <Box
        ref={threadRef}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          minHeight: 260,
          maxHeight: 480,
          overflowY: 'auto',
          p: 3,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}>
        {messages.length === 0 && (
          <Stack alignItems="center" justifyContent="center" gap={1} sx={{ flex: 1, py: 4 }}>
            <Search size={24} style={{ opacity: 0.4 }} />
            <Typography variant="body2" color="text.secondary">
              Type a query to retrieve the most relevant chunks from the knowledge base.
            </Typography>
          </Stack>
        )}

        {messages.map((m) => (
          <Stack key={m.id} gap={1.5}>
            {/* User query bubble — right aligned */}
            <Stack direction="row" justifyContent="flex-end" gap={1.25} sx={{ alignItems: 'flex-start' }}>
              <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover', borderRadius: 2, borderTopRightRadius: 4, maxWidth: '80%' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {m.query}
                </Typography>
              </Box>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'action.hover', color: 'text.secondary' }}>
                <User size={16} />
              </Avatar>
            </Stack>

            {/* Response — pending spinner, error, or the chunks table */}
            {m.isPending ? (
              <Stack direction="row" gap={1} alignItems="center" sx={{ py: 0.5 }}>
                <CircularProgress size={14} />
                <Typography variant="caption" color="text.secondary">
                  Retrieving…
                </Typography>
              </Stack>
            ) : m.error ? (
              <Alert severity="error">{m.error}</Alert>
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  {m.chunks.length} chunk{m.chunks.length === 1 ? '' : 's'} retrieved
                </Typography>
                {m.chunks.length > 0 && (
                  <>
                    <ChunksTable chunks={m.chunks.slice(0, PREVIEW_ROWS)} />
                    {m.chunks.length > PREVIEW_ROWS && (
                      <Typography variant="caption" color="primary" onClick={() => setModalChunks(m.chunks)} sx={{ display: 'inline-block', mt: 0.75, cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}>
                        See all {m.chunks.length} results
                      </Typography>
                    )}
                  </>
                )}
              </Box>
            )}
          </Stack>
        ))}
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pl: 2,
          pr: 0.75,
          py: 0.75,
          border: '1px solid',
          borderColor: inputFocused ? 'primary.main' : 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          transition: 'border-color 0.15s ease',
        }}>
        <InputBase
          fullWidth
          multiline
          maxRows={4}
          placeholder={canQuery ? 'Type your query and press Enter…' : 'Retrieval unavailable'}
          inputProps={{ 'aria-label': 'Query' }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!canSend && !input}
          sx={{ flex: 1, fontSize: 14 }}
        />
        <Button variant="contained" startIcon={isRetrieving ? <CircularProgress size={16} color="inherit" /> : <Send size={16} />} onClick={send} disabled={!canSend || !input.trim()} sx={{ borderRadius: 2, px: 2, flexShrink: 0 }}>
          Send
        </Button>
      </Box>

      <ChunksModal chunks={modalChunks} onClose={() => setModalChunks(null)} />
    </Stack>
  );
}
