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

import { Box, Chip, IconButton, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Braces } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactElement } from 'react';
import CodeViewer from '../../CodeViewer';
import CopyButton from '../../Overview/integration-as-api/CopyButton';
import { formatDateTime } from '../../../utils/time';
import { humanizeKey, jsonPretty } from '../forms/schemaForm';
import { IdText, SectionCard } from './DetailSections';
import * as styles from './StructuredValue.styles';

/**
 * A JSON value shown as labelled rows, as a form would show it. Nested objects become indented sub-forms; ids and timestamps are shown as
 * such; anything a row cannot hold falls back to the JSON viewer. The raw JSON is one toggle away,
 * and the whole value can be copied.
 */

/** How a row shows a null or empty value. */
const EMPTY = '-';

// Ids are bare UUIDs (child ids are name-<uuid>), so shape alone cannot identify one: the key must
// claim it too. Older executions prefixed child ids with their kind, which claims it as well, but
// only on a value that still ends in a UUID, so prose such as "workflow-based approval" stays text.
const ENDS_WITH_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_KEY = /(workflowid|taskid|reviewid|instanceid)$/i;
const isWorkflowId = (key: string, value: unknown): value is string => typeof value === 'string' && ENDS_WITH_UUID.test(value) && (ID_KEY.test(key) || /^(workflow|humantask|reviewactivity|childwf|childagent)-/.test(value));

const BARE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

const isPrimitiveArray = (v: unknown): v is Array<string | number | boolean | null> => Array.isArray(v) && v.every((e) => e === null || ['string', 'number', 'boolean'].includes(typeof e));

interface RowsProps {
  value: Record<string, unknown>;
  depth: number;
  onOpenWorkflow?: (workflowId: string) => void;
}

// An object as labelled rows; nested plain objects become indented sub-forms.
function ObjectRows({ value, depth, onOpenWorkflow }: RowsProps): ReactElement {
  return (
    <Box sx={depth > 0 ? styles.nested : styles.rows}>
      {Object.entries(value).map(([key, v]) => {
        const row = (content: ReactElement) => (
          <Box key={key} sx={styles.row}>
            <Typography variant="caption" sx={styles.label} title={key}>
              {humanizeKey(key)}
            </Typography>
            {content}
          </Box>
        );

        if (typeof v === 'string' && (BARE_UUID.test(v) || isWorkflowId(key, v))) {
          return row(<IdText id={v} onOpen={isWorkflowId(key, v) && onOpenWorkflow ? () => onOpenWorkflow(v) : undefined} />);
        }
        if (typeof v === 'string' && ISO_TIMESTAMP.test(v)) {
          return row(
            <Typography variant="body2" title={v} sx={styles.value}>
              {formatDateTime(v)}
            </Typography>,
          );
        }
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
          let shown: string;
          if (v === null || v === '') {
            shown = EMPTY;
          } else if (typeof v === 'boolean') {
            shown = v ? 'yes' : 'no';
          } else {
            shown = String(v);
          }
          return row(
            <Typography variant="body2" sx={typeof v === 'string' && /id$/i.test(key) ? styles.mono : styles.value}>
              {shown}
            </Typography>,
          );
        }
        if (isPrimitiveArray(v)) {
          return row(
            <Typography variant="body2" sx={styles.value}>
              {v.length === 0 ? EMPTY : v.map((e) => (e === null ? EMPTY : String(e))).join(', ')}
            </Typography>,
          );
        }
        if (typeof v === 'object' && !Array.isArray(v) && depth < 3) {
          return (
            <Box key={key} sx={styles.group}>
              <Typography variant="caption" sx={styles.groupLabel}>
                {humanizeKey(key)}
              </Typography>
              <ObjectRows value={v as Record<string, unknown>} depth={depth + 1} onOpenWorkflow={onOpenWorkflow} />
            </Box>
          );
        }
        // Lists of objects, and anything nested too deep to indent, keep their JSON shape.
        return (
          <Box key={key} sx={styles.group}>
            <Typography variant="caption" sx={styles.groupLabel}>
              {humanizeKey(key)}
            </Typography>
            <CodeViewer code={jsonPretty(v)} language="json" showCopyButton={false} showLineNumbers={false} maxHeight={240} wrapLongLines />
          </Box>
        );
      })}
    </Box>
  );
}

interface StructuredValueProps {
  title: string;
  value: unknown;
  /** Marks a value the reader cannot change here, such as a task's input. */
  readOnly?: boolean;
  collapsible?: boolean;
  /** Turns workflow ids inside the value into links that open that workflow. */
  onOpenWorkflow?: (workflowId: string) => void;
}

export default function StructuredValue({ title, value, readOnly = false, collapsible = false, onOpenWorkflow }: StructuredValueProps): JSX.Element {
  const [showRaw, setShowRaw] = useState(false);
  const raw = jsonPretty(value);

  const isFormable = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isBare = value === null || typeof value !== 'object';

  const actions = (
    <>
      <Tooltip title={showRaw ? 'Show as a form' : 'Show the raw JSON'} placement="top">
        <IconButton size="small" color={showRaw ? 'primary' : 'default'} aria-pressed={showRaw} aria-label={showRaw ? 'Show as a form' : 'Show the raw JSON'} onClick={() => setShowRaw((current) => !current)}>
          <Braces size={15} />
        </IconButton>
      </Tooltip>
      <CopyButton value={raw} label="Copy JSON" />
    </>
  );

  let body: ReactElement;
  if (showRaw || (!isFormable && !isBare)) {
    body = <CodeViewer code={raw} language="json" showCopyButton={false} showLineNumbers={false} maxHeight="32vh" wrapLongLines />;
  } else if (isBare) {
    body = <Typography sx={styles.bare}>{value === null ? EMPTY : String(value)}</Typography>;
  } else {
    body = <ObjectRows value={value as Record<string, unknown>} depth={0} onOpenWorkflow={onOpenWorkflow} />;
  }

  return (
    <SectionCard title={title} collapsible={collapsible} actions={actions} badge={readOnly ? <Chip label="Read-only" size="small" variant="outlined" sx={styles.badge} /> : undefined}>
      {body}
    </SectionCard>
  );
}
