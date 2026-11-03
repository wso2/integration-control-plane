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

import { Box, CircularProgress, Divider, IconButton, Paper, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowDown, Check, Copy, Download } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState, type JSX, type UIEvent } from 'react';
import type { BuildRunLogs } from '../types/build';
import { buildLogText } from '../utils/build';
import { downloadTextFile } from '../utils/logs';
import * as styles from './BuildLogViewer.styles';

export interface BuildLogViewerProps {
  logs: BuildRunLogs | null | undefined;
  logsLoading: boolean;
  showLogs: boolean;
  /** The build has not reached a terminal state, so more output may still arrive. */
  live?: boolean;
  /** Fills its container's height instead of growing to a capped height, e.g. as a drawer column. */
  fill?: boolean;
}

// Within this many pixels of the end counts as following the output.
const FOLLOW_SLACK_PX = 24;

function StreamStatus({ live, hasOutput }: { live: boolean; hasOutput: boolean }): JSX.Element {
  if (live && !hasOutput) {
    return (
      <Box component="span" role="status" aria-label="Waiting for build logs" sx={styles.streamStatusSx(true)}>
        <Box component="span" aria-hidden="true" sx={styles.streamDotSx(true)} />
        <span aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Box key={i} component="span" sx={styles.pendingDotSx(i)}>
              .
            </Box>
          ))}
        </span>
      </Box>
    );
  }
  return (
    <Box component="span" sx={styles.streamStatusSx(live)}>
      <Box component="span" aria-hidden="true" sx={styles.streamDotSx(live)} />
      {live ? 'Live' : 'Live logs ended'}
    </Box>
  );
}

export default function BuildLogViewer({ logs, logsLoading, showLogs, live = false, fill = false }: BuildLogViewerProps): JSX.Element | null {
  const logsRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [following, setFollowing] = useState(true);

  const logText = buildLogText(logs);
  const hasOutput = !!logText;
  const lineCount = logText ? logText.replace(/\n+$/, '').split('\n').length : 0;

  useEffect(() => {
    if (showLogs && following && logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logText, showLogs, following]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!showLogs) return null;

  if (logsLoading && !logs) {
    return (
      <Box sx={styles.loadingSx}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const handleScroll = (e: UIEvent<HTMLPreElement>): void => {
    const el = e.currentTarget;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_SLACK_PX);
  };

  const handleCopy = (): void => {
    if (!logText) return;
    // Some browsers and embedded views refuse clipboard writes; the button then simply stays unconfirmed.
    navigator.clipboard.writeText(logText).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <Paper variant="outlined" sx={styles.paperSx(fill)}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={styles.headerSx}>
        <StreamStatus live={live} hasOutput={hasOutput} />
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography component="span" sx={styles.lineCountSx}>
            {lineCount} lines
          </Typography>
          <Divider orientation="vertical" flexItem />
          <Tooltip title={copied ? 'Copied!' : 'Copy logs'}>
            <span>
              <IconButton size="small" aria-label="Copy logs" onClick={handleCopy} disabled={!hasOutput} sx={styles.toolButtonSx(copied)}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Download logs (.txt)">
            <span>
              <IconButton size="small" aria-label="Download logs" onClick={() => logText && downloadTextFile(logText, 'build-logs')} disabled={!hasOutput} sx={styles.toolButtonSx(false)}>
                <Download size={15} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Box component="pre" ref={logsRef} onScroll={handleScroll} role="log" aria-label="Build log output" sx={styles.logBodySx}>
        {logText}
        {live ? (
          <Box component="span" sx={styles.waitingSx}>
            {hasOutput ? '\n' : ''}waiting for build logs
            <Box component="span" aria-hidden="true" sx={styles.cursorSx} />
          </Box>
        ) : (
          !hasOutput && (
            <Box component="span" sx={styles.waitingSx}>
              {logText === null ? 'No log data available' : 'No build logs yet'}
            </Box>
          )
        )}
      </Box>

      {!following && hasOutput && (
        <Tooltip title="Jump to latest">
          <IconButton size="small" aria-label="Jump to latest" onClick={() => setFollowing(true)} sx={styles.jumpButtonSx}>
            <ArrowDown size={16} />
          </IconButton>
        </Tooltip>
      )}
    </Paper>
  );
}
