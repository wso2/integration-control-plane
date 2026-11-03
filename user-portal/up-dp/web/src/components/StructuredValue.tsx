/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { humanize } from '../utils/time';
import { NotProvided } from './detail';

const codeSx = {
  m: 0,
  p: 1.5,
  borderRadius: 1,
  bgcolor: 'action.hover',
  fontFamily: 'monospace',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 360,
  overflow: 'auto',
} as const;

function isPlain(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function text(value: string | number | boolean | null, t: TFunction): string {
  if (value === null) return t('common.noValue');
  if (typeof value === 'boolean') return value ? t('integrations.value.yes') : t('integrations.value.no');
  return String(value);
}

/** A value as people read it: a flat object as label/value rows, anything deeper as formatted JSON. */
export default function StructuredValue({ value }: { value: unknown }) {
  const { t } = useTranslation();
  if (value === undefined || (typeof value === 'object' && value !== null && Object.keys(value).length === 0)) return <NotProvided label={t('integrations.value.empty')} />;
  if (isPlain(value)) return <Typography variant="body2">{text(value, t)}</Typography>;

  const entries = !Array.isArray(value) && typeof value === 'object' ? Object.entries(value as Record<string, unknown>) : null;
  if (entries && entries.every(([, v]) => isPlain(v))) {
    return (
      <Stack gap={0.75}>
        {entries.map(([key, v]) => (
          <Stack key={key} direction="row" gap={2}>
            <Typography variant="body2" sx={{ width: 160, flexShrink: 0, color: 'text.secondary' }}>
              {humanize(key)}
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
              {text(v as string | number | boolean | null, t)}
            </Typography>
          </Stack>
        ))}
      </Stack>
    );
  }
  return (
    <Box component="pre" sx={codeSx}>
      {JSON.stringify(value, null, 2)}
    </Box>
  );
}
