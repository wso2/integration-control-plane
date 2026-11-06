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

import { Alert, Box, Button, Card, CardActionArea, Chip, Collapse, Divider, Drawer, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, Copy, X } from '@wso2/oxygen-ui-icons-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from '../i18n';

/**
 * The building blocks of the integration control plane's workflow screens: a detail drawer,
 * outlined section cards, selectable action cards, status chips and label/value rows.
 */

type ChipColor = 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info';

const STATUS_COLORS: Record<string, ChipColor> = {
  RUNNING: 'info',
  PENDING: 'info',
  COMPLETED: 'success',
  SUCCEEDED: 'success',
  FAILED: 'error',
  TERMINATED: 'error',
  CANCELED: 'warning',
  TIMED_OUT: 'warning',
  SUSPENDED: 'warning',
  WAITING: 'warning',
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const { t } = useTranslation();
  const normalized = status.toUpperCase();
  const labels: Record<string, string> = t('integrations.detail.status', { returnObjects: true });
  const text = label ?? labels[normalized] ?? normalized.charAt(0) + normalized.slice(1).toLowerCase().replace(/_/g, ' ');
  return <Chip label={text} size="small" color={STATUS_COLORS[normalized] ?? 'default'} variant="outlined" />;
}

/** Makes a listing row open something, by mouse or keyboard. */
export function rowOpenProps(open: () => void) {
  return {
    onClick: open,
    tabIndex: 0,
    role: 'button' as const,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
    sx: { cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } },
  };
}

export function truncateId(id: string, head = 8, tail = 6): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function NotProvided({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <Typography component="span" variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
      {label ?? t('integrations.detail.notProvided')}
    </Typography>
  );
}

/** A monospace id, shortened in the middle, with a copy button. */
export function IdText({ id, full }: { id: string; full?: boolean }) {
  const { t } = useTranslation();
  return (
    <Stack direction="row" alignItems="center" gap={0.25} sx={{ minWidth: 0 }}>
      <Typography component="span" title={id} sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: full ? 'normal' : 'nowrap', wordBreak: 'break-all' }}>
        {full ? id : truncateId(id)}
      </Typography>
      <Tooltip title={t('common.actions.copy')}>
        <IconButton
          size="small"
          aria-label={t('common.actions.copy')}
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

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack direction="row" gap={2} alignItems="center" sx={{ minHeight: 28 }}>
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

const drawerPaperSx = { width: { xs: '100%', md: 'min(960px, calc(100% - 240px))' }, display: 'flex', flexDirection: 'column' } as const;

/** A right-hand drawer over the page: a title bar with a status, a scrolling body, an action bar. */
export function DetailDrawer({ title, subtitle, status, onClose, actions, children }: { title: ReactNode; subtitle?: ReactNode; status?: ReactNode; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Drawer anchor="right" open onClose={onClose} sx={{ '& .MuiDrawer-paper': drawerPaperSx }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 3, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </Typography>
            {status}
          </Stack>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" component="div">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Button size="small" onClick={onClose} sx={{ minWidth: 0, px: 1 }} aria-label={t('common.actions.close')}>
          <X size={16} />
        </Button>
      </Stack>
      <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2.5 }}>
        <Stack gap={2} sx={{ maxWidth: 860, mx: 'auto' }}>
          {children}
        </Stack>
      </Box>
      {actions && (
        <Stack direction="row" alignItems="center" justifyContent="flex-end" gap={1} sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          {actions}
        </Stack>
      )}
    </Drawer>
  );
}

export function SectionCard({ title, badge, actions, collapsible, defaultOpen = true, children }: { title: string; badge?: ReactNode; actions?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const heading = (
    <Stack direction="row" alignItems="center" gap={1} sx={{ flex: 1, minWidth: 0, px: 2, py: 1.25 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
        {title}
      </Typography>
      {badge}
      {collapsible && <ChevronDown size={14} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s', opacity: 0.6 }} />}
    </Stack>
  );
  const body = (
    <>
      <Divider />
      <Box sx={{ px: 2, py: 2, bgcolor: 'background.paper' }}>{children}</Box>
    </>
  );
  return (
    <Card variant="outlined" sx={{ bgcolor: 'action.hover', flexShrink: 0 }}>
      <Stack direction="row" alignItems="center">
        {collapsible ? (
          <CardActionArea onClick={() => setOpen((v) => !v)} aria-expanded={open} sx={{ flex: 1, minWidth: 0 }}>
            {heading}
          </CardActionArea>
        ) : (
          heading
        )}
        {actions && (
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ pr: 1.5, flexShrink: 0 }}>
            {actions}
          </Stack>
        )}
      </Stack>
      {collapsible ? <Collapse in={open}>{body}</Collapse> : body}
    </Card>
  );
}

export function ActionCard({ title, subtitle, selected, disabled, onClick }: { title: string; subtitle: string; selected?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Card variant="outlined" sx={{ flex: '1 1 200px', maxWidth: 360, borderColor: selected ? 'primary.main' : 'divider', bgcolor: selected ? 'action.selected' : 'background.paper', opacity: disabled ? 0.55 : 1 }}>
      <CardActionArea onClick={onClick} disabled={disabled} sx={{ px: 2, py: 1.5, height: '100%' }} aria-pressed={selected}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
          {subtitle}
        </Typography>
      </CardActionArea>
    </Card>
  );
}

export function ListFooter({ summary, hasMore, loadingMore, onLoadMore }: { summary: string; hasMore: boolean; loadingMore?: boolean; onLoadMore: () => void }) {
  const { t } = useTranslation();
  return (
    <Stack direction="row" alignItems="center" justifyContent="center" gap={1.5} sx={{ mt: 1.5 }}>
      <Typography variant="caption" color="text.secondary">
        {summary}
      </Typography>
      {hasMore && (
        <Button size="small" variant="outlined" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? t('common.loading') : t('common.list.loadMore')}
        </Button>
      )}
    </Stack>
  );
}

export function SubmitError({ message, onClear }: { message: string | null; onClear: () => void }) {
  if (!message) return null;
  return (
    <Alert severity="error" onClose={onClear} sx={{ '& .MuiAlert-message': { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }}>
      {message}
    </Alert>
  );
}
