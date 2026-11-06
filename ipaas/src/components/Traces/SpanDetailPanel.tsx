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

import { Alert, Box, Button, Chip, CircularProgress, Divider, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import * as styles from './TraceSpansDrawer.styles';
import { apiErrorMessage } from '../../utils/apiErrors';
import { formatAttributeValue, formatDuration } from '../../utils/traces';
import { useSpanDetail } from '../../hooks/useTraces';
import type { TraceQuery } from '../../types/traces';

interface SpanDetailPanelProps {
  componentId: string;
  envId: string;
  traceId: string;
  spanId: string;
  window: TraceQuery;
}

function AttributeList({ title, attributes }: { title: string; attributes: Record<string, unknown> }): JSX.Element | null {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return null;
  return (
    <Box sx={styles.attributeBlock}>
      <Typography variant="subtitle2" gutterBottom>
        {title}
      </Typography>
      {entries.map(([key, value]) => (
        <Box key={key} sx={styles.attributeBlock}>
          <Typography variant="caption" sx={styles.attributeKey}>
            {key}
          </Typography>
          <Typography component="pre" sx={styles.attributeValue}>
            {formatAttributeValue(value)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default function SpanDetailPanel({ componentId, envId, traceId, spanId, window: traceWindowQuery }: SpanDetailPanelProps): JSX.Element {
  const { data: span, isLoading, isError, error, refetch } = useSpanDetail(componentId, envId, traceId, spanId, traceWindowQuery);

  if (isLoading) {
    return (
      <Stack gap={1}>
        <Skeleton variant="text" width="60%" height={28} />
        <Skeleton variant="rectangular" height={80} />
        <Skeleton variant="rectangular" height={160} />
      </Stack>
    );
  }

  if (isError) {
    return (
      <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
        {apiErrorMessage(error, 'Could not load this span.')}
      </Alert>
    );
  }

  if (!span) {
    return (
      <Box sx={styles.centered}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6">{span.spanName}</Typography>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" mt={0.5} mb={2}>
        {span.kind ? <Chip size="small" variant="outlined" label={span.kind} /> : null}
        <Typography variant="caption" color="text.secondary">
          {formatDuration(span.durationNs)}
        </Typography>
        <Typography variant="caption" sx={styles.attributeKey}>
          {span.spanId}
        </Typography>
      </Stack>

      {span.statusMessage ? (
        <Alert severity={span.error ? 'error' : 'info'} sx={styles.attributeBlock}>
          {span.statusMessage}
        </Alert>
      ) : null}

      <Divider sx={styles.attributeBlock} />

      {span.ampAttributes ? <AttributeList title="Derived" attributes={span.ampAttributes} /> : null}
      {span.attributes ? <AttributeList title="Attributes" attributes={span.attributes} /> : null}
      {span.resourceAttributes ? <AttributeList title="Resource" attributes={span.resourceAttributes} /> : null}

      {!span.ampAttributes && !span.attributes && !span.resourceAttributes ? <Typography color="text.secondary">This span carries no attributes.</Typography> : null}
    </Box>
  );
}
