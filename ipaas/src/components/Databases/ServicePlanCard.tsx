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

import { Box, Card, CardActionArea, Typography } from '@wso2/oxygen-ui';
import { Check, ShieldCheck, TriangleAlert } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import * as styles from './ServicePlanCard.styles';

export interface PlanSpec {
  label: string;
  value: string;
}

interface ServicePlanCardProps {
  name: string;
  tagline: string;
  price?: { monthly: string; hourly: string };
  specs: PlanSpec[];
  note: string;
  /** `warning` marks a plan unfit for production, such as one without backups. */
  noteTone: 'success' | 'warning';
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A plan option in a radio group: name, list price, size grid and one reliability note. */
export default function ServicePlanCard({ name, tagline, price, specs, note, noteTone, selected, disabled = false, onSelect }: ServicePlanCardProps): JSX.Element {
  const ariaLabel = price ? `${name}, ${price.monthly} per month` : name;
  return (
    <Card variant="outlined" sx={styles.cardSx(selected, disabled)}>
      <CardActionArea role="radio" aria-checked={selected} aria-label={ariaLabel} disabled={disabled} disableRipple onClick={onSelect} sx={styles.actionAreaSx}>
        <Box sx={styles.headerSx}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tagline}
            </Typography>
          </Box>
          <Box aria-hidden sx={styles.radioDotSx(selected)}>
            {selected && <Check size={13} strokeWidth={3.5} />}
          </Box>
        </Box>

        {price && (
          <Box>
            <Typography variant="h4" component="p" sx={styles.priceSx(selected)}>
              {price.monthly}
              <Typography component="span" variant="body2" color="text.secondary">
                {' '}
                / month
              </Typography>
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={styles.hourlySx}>
              {price.hourly} / hour
            </Typography>
          </Box>
        )}

        <Box sx={styles.specGridSx}>
          {specs.map((spec) => (
            <Box key={spec.label} sx={styles.specCellSx}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {spec.label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {spec.value}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={styles.noteSx}>
          <Box component="span" aria-hidden sx={{ ...styles.noteIconSx, color: `${noteTone}.main` }}>
            {noteTone === 'success' ? <ShieldCheck size={16} /> : <TriangleAlert size={16} />}
          </Box>
          <Typography variant="body2" color={noteTone === 'warning' ? 'warning.main' : 'text.secondary'}>
            {note}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}
