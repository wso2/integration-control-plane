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

import { alpha, Alert, Box, Button, Card, CardActionArea, Chip, CircularProgress, Collapse, Divider, Drawer, FormControlLabel, IconButton, Link, ListingTable, Menu, MenuItem, Stack, Switch, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Bug, ChevronDown, ChevronRight, Copy, EllipsisVertical, Info } from '@wso2/oxygen-ui-icons-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState, type JSX, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { resourceUrl, useScope } from '../../nav';
import CodeViewer from '../CodeViewer';
import { autoRefreshEnabled, setAutoRefreshEnabled } from '../../api/workflows';
import { displayWorkflowId, sectionTitleSx, STATUS_COLORS } from './helpers';
import { useLayout } from '../../contexts/LayoutContext';
import { X } from '@wso2/oxygen-ui-icons-react';
import { formatClock } from '../../utils/time';

export interface WorkflowScope {
  componentId: string;
  environmentId: string;
}

export const APP_BAR_HEIGHT = 64;

export function rowOpenProps(open: () => void) {
  return {
    onClick: open,
    tabIndex: 0,
    role: 'button' as const,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
    sx: { cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } },
  };
}

function useViewWorkflowById(environmentId: string): (workflowId: string) => void {
  const navigate = useNavigate();
  const scope = useScope();
  return (workflowId: string) => {
    navigate(`${resourceUrl(scope, 'workflows')}?tab=management&workflowId=${encodeURIComponent(workflowId)}&env=${encodeURIComponent(environmentId)}`);
  };
}

export function truncateId(id: string, head = 8, tail = 6): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function WorkflowIdLink({ workflowId, environmentId, onNavigate, truncate, copy }: { workflowId?: string; environmentId: string; onNavigate?: () => void; truncate?: boolean; copy?: boolean }): JSX.Element {
  const viewWorkflow = useViewWorkflowById(environmentId);
  if (!workflowId) return <NotProvided />;
  const shown = displayWorkflowId(workflowId);
  return (
    <Stack direction="row" alignItems="center" gap={0.25} sx={{ minWidth: 0 }}>
      <Link
        component="button"
        type="button"
        title={workflowId}
        onClick={(e) => {
          e.stopPropagation();
          onNavigate?.();
          viewWorkflow(workflowId);
        }}
        sx={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'left', wordBreak: 'break-all', cursor: 'pointer', color: 'text.primary', textDecorationColor: 'inherit' }}>
        {truncate ? truncateId(shown) : shown}
      </Link>
      {copy && (
        <Tooltip title="Copy ID">
          <IconButton
            size="small"
            aria-label="copy workflow id"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(workflowId);
            }}>
            <Copy size={12} />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

export function RefreshingNote({ show, fetchedAt, label = 'refreshing — fetching the latest from the integration…' }: { show: boolean; fetchedAt?: number; label?: string }): JSX.Element | null {
  const qc = useQueryClient();
  const [auto, setAuto] = useState(autoRefreshEnabled());
  if (!show && !fetchedAt) return null;
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ color: 'text.secondary' }}>
      {show && auto && <CircularProgress size={12} thickness={5} />}
      <Typography variant="caption">
        {fetchedAt ? `Updated ${formatClock(fetchedAt * 1000)}` : ''}
        {show && auto ? `${fetchedAt ? ' · ' : ''}${label}` : ''}
      </Typography>
      <Tooltip title={auto ? 'Auto-refresh is on: this view checks for fresher data every 30 seconds. The refresh button always works.' : 'Auto-refresh is off: this view updates only when you refresh it.'}>
        <FormControlLabel
          sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12, color: 'text.secondary' } }}
          control={
            <Switch
              size="small"
              checked={auto}
              onChange={(e) => {
                const on = e.target.checked;
                setAutoRefreshEnabled(on);
                setAuto(on);
                if (on) qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'wf' });
              }}
            />
          }
          label="auto-refresh"
        />
      </Tooltip>
    </Stack>
  );
}

export function IdText({ id, muted }: { id?: string; muted?: boolean }): JSX.Element {
  if (!id) return <NotProvided />;
  return (
    <Stack direction="row" alignItems="center" gap={0.25} sx={{ minWidth: 0 }}>
      <Typography component="span" title={id} sx={{ fontFamily: 'monospace', fontSize: 12, color: muted ? 'text.secondary' : 'text.primary', whiteSpace: 'nowrap' }}>
        {truncateId(id)}
      </Typography>
      <Tooltip title="Copy ID">
        <IconButton
          size="small"
          aria-label="copy id"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(id);
          }}>
          <Copy size={12} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

export function NotProvided({ label = 'Not provided' }: { label?: string }): JSX.Element {
  return (
    <Typography component="span" variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
      {label}
    </Typography>
  );
}

export function DebugInfoIcon({ size = 14 }: { size?: number }): JSX.Element {
  const badge = Math.round(size * 0.7);
  return (
    <Box component="span" sx={{ position: 'relative', display: 'inline-flex', lineHeight: 0 }}>
      <Bug size={size} />
      <Box
        component="span"
        sx={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          display: 'inline-flex',
          borderRadius: '50%',
          bgcolor: 'background.paper',
          lineHeight: 0,
        }}>
        <Info size={badge} strokeWidth={2.75} />
      </Box>
    </Box>
  );
}

export function HeaderMenu({ items }: { items: { label: string; color?: 'warning' | 'error'; disabled?: boolean; onClick: () => void }[] }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton size="small" aria-label="more operations" onClick={(e) => setAnchor(e.currentTarget)}>
        <EllipsisVertical size={16} />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {items.map((item) => (
          <MenuItem
            key={item.label}
            disabled={item.disabled}
            onClick={() => {
              setAnchor(null);
              item.onClick();
            }}
            sx={item.color ? { color: `${item.color}.main` } : undefined}>
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export function DetailDrawer({ title, status, onClose, actions, menu, children }: { title: ReactNode; status?: string; onClose: () => void; actions?: ReactNode; menu?: ReactNode; children: ReactNode }): JSX.Element {
  const { sidebarWidth } = useLayout();
  return (
    <Drawer
      anchor="right"
      open
      variant="persistent"
      onClose={onClose}
      sx={{ '& .MuiDrawer-paper': { width: `calc(100% - ${sidebarWidth}px)`, position: 'fixed', top: APP_BAR_HEIGHT, height: `calc(100% - ${APP_BAR_HEIGHT}px)`, borderLeft: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 3, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="div" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </Typography>
          {status && <StatusChip status={status} />}
        </Stack>
        <Stack direction="row" alignItems="center" gap={0.5}>
          {menu}
          <Button size="small" onClick={onClose} sx={{ minWidth: 0, px: 1 }} aria-label="close">
            <X size={16} />
          </Button>
        </Stack>
      </Stack>
      <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2.5 }}>
        <Box sx={{ maxWidth: 860, mx: 'auto' }}>{children}</Box>
      </Box>
      {actions && (
        <Stack direction="row" alignItems="center" gap={1} sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          {actions}
        </Stack>
      )}
    </Drawer>
  );
}

export function SectionCard({ title, badge, actions, collapsible, defaultOpen = true, children }: { title: string; badge?: ReactNode; actions?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const titleBlock = (
    <Stack direction="row" alignItems="center" gap={1} sx={{ flex: 1, minWidth: 0, px: 2, py: 1.5 }}>
      <Typography variant="subtitle2" sx={sectionTitleSx}>
        {title}
      </Typography>
      {badge}
      {collapsible && <ChevronDown size={14} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s', opacity: 0.6 }} />}
    </Stack>
  );
  const header = (
    <Stack direction="row" alignItems="center">
      {collapsible ? (
        <CardActionArea onClick={() => setOpen((v) => !v)} aria-expanded={open} sx={{ flex: 1, minWidth: 0 }}>
          {titleBlock}
        </CardActionArea>
      ) : (
        titleBlock
      )}
      {actions && (
        <Stack direction="row" alignItems="center" gap={0.25} sx={{ pr: 1.5, flexShrink: 0 }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
  return (
    <Card variant="outlined" sx={{ bgcolor: 'action.hover' }}>
      {header}
      {collapsible ? (
        <Collapse in={open}>
          <Divider />
          <Box sx={{ px: 2, py: 2 }}>{children}</Box>
        </Collapse>
      ) : (
        <>
          <Divider />
          <Box sx={{ px: 2, py: 2 }}>{children}</Box>
        </>
      )}
    </Card>
  );
}

export function ActionCard({ title, subtitle, info, selected, disabled, disabledReason, onClick }: { title: string; subtitle: string; info?: string; selected?: boolean; disabled?: boolean; disabledReason?: string; onClick: () => void }): JSX.Element {
  const card = (
    <Card
      variant="outlined"
      sx={{
        flex: '1 1 240px',
        maxWidth: 360,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.selected' : 'background.paper',
        opacity: disabled ? 0.55 : 1,
      }}>
      <CardActionArea onClick={onClick} disabled={disabled} sx={{ px: 2, py: 1.5, height: '100%' }} aria-pressed={selected}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          </Box>
          {info && (
            <Tooltip title={info}>
              <IconButton size="small" aria-label={`about ${title}`} onClick={(e) => e.stopPropagation()} sx={{ p: 0.25, color: 'text.disabled', mt: 0.25 }}>
                <Info size={14} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </CardActionArea>
    </Card>
  );
  return disabled && disabledReason ? (
    <Tooltip title={disabledReason}>
      <span style={{ display: 'flex', flex: '1 1 240px', maxWidth: 360 }}>{card}</span>
    </Tooltip>
  ) : (
    card
  );
}

export function ListFooter({ count, singular, plural, hasMore, loadingMore, onLoadMore }: { count: number; singular: string; plural: string; hasMore: boolean; loadingMore?: boolean; onLoadMore?: () => void }): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" justifyContent="center" gap={1.5} sx={{ mt: 1.5 }}>
      <Typography variant="caption" color="text.secondary">
        Showing {count} {count === 1 ? singular : plural}
        {hasMore ? (onLoadMore ? ' — more available' : ' — more exist; narrow the filters to see them') : ''}
      </Typography>
      {hasMore && onLoadMore && (
        <Button size="small" variant="outlined" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </Stack>
  );
}

export function HeaderCell({ label, help }: { label: string; help: string }): JSX.Element {
  return (
    <ListingTable.Cell>
      <Tooltip title={help} placement="top">
        <Typography component="span" variant="inherit" sx={{ cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 3, textDecorationColor: (t) => alpha(t.palette.text.secondary, 0.5) }}>
          {label}
        </Typography>
      </Tooltip>
    </ListingTable.Cell>
  );
}

export function StatusChip({ status }: { status?: string }): JSX.Element {
  const normalized = (status ?? '').toUpperCase();
  const color = STATUS_COLORS[normalized] ?? 'default';
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, ' ') : '—';
  return <Chip label={label} size="small" color={color} variant="outlined" />;
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <Stack direction="row" gap={2}>
      <Typography variant="body2" sx={{ width: 140, flexShrink: 0, fontWeight: 600, color: 'text.disabled' }}>
        {label}
      </Typography>
      {typeof children === 'string' ? (
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {children}
        </Typography>
      ) : (
        children
      )}
    </Stack>
  );
}

export function SubmitError({ message, onClear }: { message: string | null; onClear: () => void }): JSX.Element | null {
  if (!message) return null;
  return (
    <Alert severity="error" onClose={onClear} sx={{ '& .MuiAlert-message': { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }}>
      {message}
    </Alert>
  );
}

export function SchemaDisclosure({ schema, label = 'Click to see Input Schema' }: { schema: string; label?: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Stack
        direction="row"
        alignItems="center"
        gap={0.5}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        sx={{ px: 1.5, py: 1, cursor: 'pointer', userSelect: 'none', bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}>
        <ChevronRight size={16} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none', flexShrink: 0 }} />
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
      </Stack>
      <Collapse in={open}>
        <Box sx={{ p: 1 }}>
          <CodeViewer code={schema} language="json" showCopyButton maxHeight="40vh" showLineNumbers={false} />
        </Box>
      </Collapse>
    </Box>
  );
}
