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

import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Box, Collapse, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronUp } from '@wso2/oxygen-ui-icons-react';
import type { BaseType, JSONSchema } from '../../types/schema';
import { type LinkingInfo, type SchemaField, ownPackage, schemaFields } from './schemaUtils';
import { ConfigElement } from './FormElements/ConfigElement';
import { FieldLinkContext, type FieldLinks, noFieldLinks } from './linkedFrom';
import { ManagedConfigContext } from './managedConfig';

interface ConfigGroup {
  groupUuid: string;
  groupName: string;
  groupDisplayName?: string;
  configurations: { keyUuid: string; key: string; isSensitive?: boolean }[];
}

/** A box of fields: a connection's configurables, with its link in the title bar. */
export interface FormGroup {
  id: string;
  title: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
  /** Config keys, in the schema's order. */
  keys: string[];
}

export interface ConfigFormProps {
  schema: JSONSchema;
  valueMap: Map<string, BaseType>;
  validationMap: Map<string, boolean>;
  linkingMap: Map<string, LinkingInfo>;
  setLinkingMap: Dispatch<SetStateAction<Map<string, LinkingInfo>>>;
  sensitiveMap: Map<string, boolean>;
  setSensitiveMap: Dispatch<SetStateAction<Map<string, boolean>>>;
  configGroups?: ConfigGroup[];
  handleValueChange: (jsonPath: string, value: BaseType, configMap?: Map<string, BaseType>) => void;
  handleValidationChange: (jsonPath: string, isValid: boolean, validationMap?: Map<string, boolean>) => void;
  /** Boxes before "Other configurables", one per connection. */
  groups?: FormGroup[];
  fieldLinks?: FieldLinks;
  /** Keys the platform sets; shown read-only. */
  managedKeys?: ReadonlySet<string>;
}

const groupSx = { mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 } as const;
const headSx = { px: 2, py: 1, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' } as const;

const NO_MANAGED_KEYS: ReadonlySet<string> = new Set();

/** Required fields first, each list in the schema's order. */
const requiredFirst = (fields: SchemaField[]) => [...fields.filter((f) => f.required), ...fields.filter((f) => !f.required)];

export function ConfigForm({
  schema,
  valueMap,
  handleValueChange,
  validationMap,
  handleValidationChange,
  linkingMap,
  setLinkingMap,
  sensitiveMap,
  setSensitiveMap,
  configGroups,
  groups = [],
  fieldLinks = noFieldLinks,
  managedKeys = NO_MANAGED_KEYS,
}: ConfigFormProps) {
  const targetLevel = schema.requiredLevel || 1;
  const fields = schemaFields(schema);
  const own = ownPackage(fields);
  const grouped = new Set(groups.flatMap((g) => g.keys));
  const other = fields.filter((f) => f.pkg === own && !grouped.has(f.path));
  const libraries = [...new Set(fields.filter((f) => f.pkg !== own).map((f) => f.pkg))];

  const renderField = (f: SchemaField) => (
    <ConfigElement
      key={f.path}
      title={f.label}
      type={f.schema.properties![f.key].type || 'anyOf'}
      schema={f.schema}
      jsonPath={f.path}
      propertyKey={f.key}
      valueMap={valueMap}
      handleValueChange={handleValueChange}
      validationMap={validationMap}
      handleValidationChange={handleValidationChange}
      isRequired={f.required}
      isRequiredAtRequiredLevel={f.required && targetLevel === 1}
      // Configuration groups aren't served by the BFF, so fields never link to one.
      allowLinking={false}
      configGroups={configGroups}
      linkingMap={linkingMap}
      setLinkingMap={setLinkingMap}
      sensitiveMap={sensitiveMap}
      setSensitiveMap={setSensitiveMap}
    />
  );

  const box = (id: string, title: ReactNode, actions: ReactNode, note: ReactNode, list: SchemaField[]) => (
    <Box key={id} sx={groupSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={headSx}>
        <Box sx={{ minWidth: 0 }}>{title}</Box>
        {actions}
      </Stack>
      <Box sx={{ px: 2, pt: 0.5, pb: 1 }}>
        {note}
        {requiredFirst(list).map(renderField)}
      </Box>
    </Box>
  );

  return (
    <ManagedConfigContext.Provider value={managedKeys}>
      <FieldLinkContext.Provider value={fieldLinks}>
        {groups.map((g) =>
          box(
            g.id,
            g.title,
            g.actions,
            g.note,
            fields.filter((f) => g.keys.includes(f.path)),
          ),
        )}
        {other.length > 0 &&
          box(
            'other',
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {groups.length > 0 ? 'Other configurables' : 'Configurables'}
            </Typography>,
            null,
            null,
            other,
          )}
        {libraries.map((pkg) => {
          const list = fields.filter((f) => f.pkg === pkg);
          return (
            <LibraryBox key={pkg} title={pkg.replace('.', '/')} expanded={list.some((f) => f.required)}>
              {requiredFirst(list).map(renderField)}
            </LibraryBox>
          );
        })}
      </FieldLinkContext.Provider>
    </ManagedConfigContext.Provider>
  );
}

/** A library package's configurables, as tuning: collapsed unless one is required. */
function LibraryBox({ title, expanded, children }: { title: string; expanded: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(expanded);
  return (
    <Box sx={groupSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" onClick={() => setOpen((o) => !o)} sx={{ ...headSx, cursor: 'pointer', borderBottom: open ? 1 : 0 }} role="button" aria-expanded={open}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {title}
        </Typography>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </Stack>
      <Collapse in={open}>
        <Box sx={{ px: 2, pt: 0.5, pb: 1 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}
