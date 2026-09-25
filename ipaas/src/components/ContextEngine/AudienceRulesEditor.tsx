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

import { Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useRoles } from '../../hooks/useAuth';
import { audienceError } from '../../utils/contextEngine';
import { audienceRowSx, audienceSectionSx, fieldStackSx } from './styles';
import type { AudienceRule } from '../../types/contextEngine';

interface AudienceRulesEditorProps {
  orgHandle: string;
  /** Connector display name, e.g. "Confluence", for the group label. */
  connectorName: string;
  rules: AudienceRule[];
  onChange: (rules: AudienceRule[]) => void;
}

const BLANK: AudienceRule = { group: '', role: '' };

/**
 * Who can see a source's content. The connector labels every item with the
 * groups allowed to see it in the source system; each rule maps one of those
 * groups to an org role. The engine holds back items whose groups have no rule.
 */
export default function AudienceRulesEditor({ orgHandle, connectorName, rules, onChange }: AudienceRulesEditorProps): JSX.Element {
  const roles = useRoles(orgHandle);
  const rows = rules.length ? rules : [BLANK];
  const typed = rows.some((r) => r.group.trim() || r.role.trim());
  // An untouched section is explained, not flagged; problems show once something is typed.
  const error = typed ? audienceError(rows) : '';
  const setRow = (i: number, patch: Partial<AudienceRule>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => onChange(rows.length === 1 ? [BLANK] : rows.filter((_, j) => j !== i));

  const roleField = (rule: AudienceRule, i: number) => {
    if (roles.isError) {
      return (
        <TextField
          label="Visible to role"
          size="small"
          fullWidth
          value={rule.role}
          placeholder="Role handle, e.g. developer"
          helperText={i === 0 ? "Couldn't load org roles — enter the role handle." : undefined}
          onChange={(e) => setRow(i, { role: e.target.value })}
        />
      );
    }
    const options = roles.data ?? [];
    const known = options.some((r) => r.roleId === rule.role);
    return (
      <TextField select label="Visible to role" size="small" fullWidth value={rule.role} disabled={roles.isLoading} helperText={roles.isLoading && i === 0 ? 'Loading roles…' : undefined} onChange={(e) => setRow(i, { role: e.target.value })}>
        {rule.role && !known && <MenuItem value={rule.role}>{rule.role}</MenuItem>}
        {options.map((r) => (
          <MenuItem key={r.roleId} value={r.roleId}>
            {r.roleName}
          </MenuItem>
        ))}
      </TextField>
    );
  };

  return (
    <Box sx={audienceSectionSx}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Who can see this content
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {`${connectorName} tells the engine which of its groups may see each item. Map those groups to org roles. Items with a group you haven't mapped are held back, and only role members with query access see the rest.`}
      </Typography>
      <Stack sx={fieldStackSx}>
        {rows.map((rule, i) => (
          <Box key={i} sx={audienceRowSx}>
            <TextField label={`${connectorName} group`} size="small" fullWidth value={rule.group} placeholder="e.g. engineering" onChange={(e) => setRow(i, { group: e.target.value })} />
            {roleField(rule, i)}
            <Tooltip title="Remove rule">
              <span>
                <IconButton aria-label={`Remove rule ${i + 1}`} size="small" onClick={() => removeRow(i)} disabled={rows.length === 1 && !typed} sx={{ mt: 0.5 }}>
                  <Trash2 size={16} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ))}
      </Stack>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mt: 1.5 }} flexWrap="wrap">
        <Button size="small" variant="text" startIcon={<Plus size={14} />} onClick={() => onChange([...rows, BLANK])}>
          Map another group
        </Button>
        {error && (
          <Typography variant="caption" color={typed ? 'error' : 'text.secondary'} role="status">
            {error}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
