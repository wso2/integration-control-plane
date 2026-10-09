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

import { Accordion, AccordionDetails, AccordionSummary, Box, Button, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { ChevronDown, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import type { ApimApiInfo } from '../../../types/apim';

const HIDDEN_PROPERTY_KEYS = new Set(['projectId', 'accessibility']);

interface KvPair {
  name: string;
  value: string;
}

function extractAdditionalProperties(apimInfo: ApimApiInfo): KvPair[] {
  const raw = apimInfo.additionalProperties as { name?: string; value?: string }[] | undefined;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p) => p.name && !HIDDEN_PROPERTY_KEYS.has(p.name)).map((p) => ({ name: p.name ?? '', value: p.value ?? '' }));
}

interface GeneralTabProps {
  apimInfo: ApimApiInfo;
}

export default function GeneralTab({ apimInfo }: GeneralTabProps): JSX.Element {
  const [pairs, setPairs] = useState<KvPair[]>(extractAdditionalProperties(apimInfo));

  useEffect(() => {
    setPairs(extractAdditionalProperties(apimInfo));
  }, [apimInfo]);

  const addRow = () => setPairs((prev) => [...prev, { name: '', value: '' }]);
  const removeRow = (idx: number) => setPairs((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx: number, field: 'name' | 'value', val: string) => setPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));

  return (
    <Accordion defaultExpanded disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ChevronDown size={18} />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Properties
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Specify custom key:value pairs for the API
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0, pb: 2 }}>
        <Table size="small" sx={{ mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
              <TableCell sx={{ width: 48 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {pairs.map((pair, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  <TextField value={pair.name} onChange={(e) => updateRow(idx, 'name', e.target.value)} size="small" fullWidth />
                </TableCell>
                <TableCell>
                  <TextField value={pair.value} onChange={(e) => updateRow(idx, 'value', e.target.value)} size="small" fullWidth />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => removeRow(idx)} aria-label="Remove row" sx={{ color: 'error.main' }}>
                    <Trash2 size={16} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {pairs.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                    No properties defined.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Button variant="outlined" size="small" startIcon={<Plus size={16} />} onClick={addRow}>
          Add Item
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
