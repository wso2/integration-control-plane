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

import { Box, Button, CircularProgress, Divider, InputAdornment, Stack, Typography, TextField } from '@wso2/oxygen-ui';
import { GitCommit, Search } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState } from 'react';
import type { Commit } from '../../types/repository';

interface CommitSelectorProps {
  commits: Commit[];
  commitsLoading: boolean;
  onBuild: (commit: Commit) => void;
  isBuildTriggering: boolean;
}

export default function CommitSelector({ commits, commitsLoading, onBuild, isBuildTriggering }: CommitSelectorProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Commit | null>(commits[0] ?? null);

  useEffect(() => {
    if (commits.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((prev) => (prev && commits.some((c) => c.sha === prev.sha) ? prev : commits[0]));
  }, [commits]);

  const filtered = search
    ? commits.filter((c) => c.message.toLowerCase().includes(search.toLowerCase()) || c.sha.toLowerCase().includes(search.toLowerCase()))
    : commits;

  if (commitsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} color="primary" />
      </Box>
    );
  }

  if (commits.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        No commits available.
      </Typography>
    );
  }

  return (
    <Stack gap={2} sx={{ height: '100%' }}>
      <TextField
        size="small"
        placeholder="Search commits…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={16} />
            </InputAdornment>
          ),
        }}
      />

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {filtered.map((commit) => {
          const isSelected = selected?.sha === commit.sha;
          return (
            <Box
              key={commit.sha}
              role="button"
              tabIndex={0}
              aria-selected={isSelected}
              onClick={() => setSelected(commit)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(commit); } }}
              sx={{
                p: 1.5,
                mb: 0.5,
                border: '1px solid',
                borderColor: isSelected ? 'primary.main' : 'divider',
                borderRadius: 1,
                cursor: 'pointer',
                bgcolor: isSelected ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}>
              <Stack direction="row" alignItems="flex-start" gap={1}>
                <GitCommit size={14} style={{ opacity: 0.55, flexShrink: 0, marginTop: 2 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.25 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', flexShrink: 0 }}>
                      {commit.sha.slice(0, 7)}
                    </Typography>
                    {commit.isLatest && (
                      <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, flexShrink: 0 }}>
                        latest
                      </Typography>
                    )}
                  </Stack>
                  <Typography
                    variant="body2"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                    {commit.message}
                  </Typography>
                  {commit.author?.name && (
                    <Typography variant="caption" color="text.secondary">
                      {commit.author.name}
                      {commit.author.date ? ` · ${new Date(commit.author.date).toLocaleDateString()}` : ''}
                    </Typography>
                  )}
                </Box>
              </Stack>
            </Box>
          );
        })}
      </Box>

      <Divider />

      <Stack direction="row" justifyContent="flex-end" gap={1}>
        <Button
          variant="contained"
          size="small"
          disabled={!selected || isBuildTriggering}
          startIcon={isBuildTriggering ? <CircularProgress color="inherit" size={14} /> : undefined}
          onClick={() => selected && onBuild(selected)}>
          {isBuildTriggering ? 'Building…' : 'Build'}
        </Button>
      </Stack>
    </Stack>
  );
}
