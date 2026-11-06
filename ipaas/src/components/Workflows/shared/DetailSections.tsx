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

import { Box, ButtonBase, Collapse, Link, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, Info } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactNode } from 'react';
import CopyButton from '../../Overview/integration-as-api/CopyButton';
import * as styles from './DetailSections.styles';

/**
 * The building blocks of the task and review views: every section
 * is the same card, titled the same way, and every decision is a card you pick rather than a row of
 * buttons.
 */

/**
 * The heading of a detail view: what the item is, its status, and one line of context. The drawer's
 * own title bar stays generic; this is what a reader's eye lands on first.
 */
export function DetailHeader({ title, status, meta }: { title: string; status?: ReactNode; meta?: ReactNode }): JSX.Element {
  return (
    <Box sx={styles.header}>
      <Box sx={styles.headerTitleRow}>
        <Typography component="h2" sx={styles.headerTitle}>
          {title}
        </Typography>
        {status}
      </Box>
      {meta && (
        <Typography component="div" sx={styles.headerMeta}>
          {meta}
        </Typography>
      )}
    </Box>
  );
}

/** The rows of a section, each parted from the next by a hairline. */
export function DetailList({ children }: { children: ReactNode }): JSX.Element {
  return <Box sx={styles.detailList}>{children}</Box>;
}

interface SectionCardProps {
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A titled card holding one part of a detail view, optionally collapsible. */
export function SectionCard({ title, badge, actions, collapsible = false, defaultOpen = true, children }: SectionCardProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  const titleContent = (
    <>
      <Typography component="h3" sx={styles.sectionTitle}>
        {title}
      </Typography>
      {badge}
      {collapsible && (
        <Box component="span" sx={styles.chevron(open)}>
          <ChevronDown size={16} />
        </Box>
      )}
    </>
  );

  const body = <Box sx={styles.sectionBody}>{children}</Box>;

  return (
    <Box component="section" sx={styles.section}>
      <Box sx={styles.sectionHeader}>
        {collapsible ? (
          <ButtonBase sx={styles.sectionTitleBlock} onClick={() => setOpen((current) => !current)} aria-expanded={open}>
            {titleContent}
          </ButtonBase>
        ) : (
          <Box sx={styles.sectionTitleBlock}>{titleContent}</Box>
        )}
        {actions && <Box sx={styles.sectionActions}>{actions}</Box>}
      </Box>
      {collapsible ? <Collapse in={open}>{body}</Collapse> : body}
    </Box>
  );
}

/** One labelled value inside a section. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <Box sx={styles.detailRow}>
      <Typography variant="body2" sx={styles.detailLabel}>
        {label}
      </Typography>
      {typeof children === 'string' ? (
        <Typography variant="body2" sx={styles.detailValue}>
          {children}
        </Typography>
      ) : (
        <Box sx={styles.detailValue}>{children}</Box>
      )}
    </Box>
  );
}

/** What a row shows when the engine did not report the value. */
export function NotProvided({ label = 'Not provided' }: { label?: string }): JSX.Element {
  return (
    <Typography component="span" variant="body2" sx={styles.notProvided}>
      {label}
    </Typography>
  );
}

/** `0193f2a1…9c4e7b`: an id short enough for a row, in full on hover. */
// eslint-disable-next-line react-refresh/only-export-components
export function truncateId(id: string, head = 8, tail = 6): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}

/**
 * An id, shortened, with a button that copies it whole. With `onOpen`, the id is also a link to
 * what it names. Clicks stay here, so an id inside a clickable row does not open the row.
 */
export function IdText({ id, onOpen }: { id?: string | null; onOpen?: () => void }): JSX.Element {
  if (!id) {
    return <NotProvided />;
  }
  return (
    <Box component="span" sx={styles.idText} onClick={(event) => event.stopPropagation()}>
      {onOpen ? (
        <Link component="button" type="button" title={id} sx={styles.idValue} onClick={onOpen}>
          {truncateId(id)}
        </Link>
      ) : (
        <Box component="span" title={id} sx={styles.idValue}>
          {truncateId(id)}
        </Box>
      )}
      <CopyButton value={id} label="Copy ID" />
    </Box>
  );
}

interface ActionCardProps {
  title: string;
  subtitle: string;
  /** What the action does in full, behind an info icon. */
  info?: string;
  selected?: boolean;
  disabled?: boolean;
  /** Why the action is unavailable, shown when the disabled card is hovered. */
  disabledReason?: string;
  onClick: () => void;
}

/** A decision offered as a card: what it is, in a line, with the detail behind an info icon. */
export function ActionCard({ title, subtitle, info, selected = false, disabled = false, disabledReason, onClick }: ActionCardProps): JSX.Element {
  const card = (
    <Box sx={styles.actionCard(selected, disabled)}>
      <ButtonBase sx={styles.actionCardButton} onClick={onClick} disabled={disabled} aria-pressed={selected}>
        <Box>
          <Typography variant="body2" sx={styles.actionCardTitle}>
            {title}
          </Typography>
          <Typography component="div" sx={styles.actionCardSubtitle}>
            {subtitle}
          </Typography>
        </Box>
        {info && (
          <Tooltip title={info} placement="top">
            <Box component="span" sx={styles.actionCardInfo} aria-label={`about ${title}`}>
              <Info size={15} />
            </Box>
          </Tooltip>
        )}
      </ButtonBase>
    </Box>
  );
  return disabled && disabledReason ? (
    <Tooltip title={disabledReason} placement="top">
      <Box component="span" sx={styles.actionCardTooltipWrap}>
        {card}
      </Box>
    </Tooltip>
  ) : (
    card
  );
}

/** The row the action cards of one section sit in. */
export function ActionCardRow({ children }: { children: ReactNode }): JSX.Element {
  return <Box sx={styles.actionRow}>{children}</Box>;
}
