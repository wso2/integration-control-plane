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

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Box, Collapse, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronUp } from '@wso2/oxygen-ui-icons-react';
import type { BaseType, JSONSchema } from '../../types/schema';
import { type LinkingInfo, type SchemaAtLevel, getSchemasAtLevel } from './schemaUtils';
import { ConfigElement } from './FormElements/ConfigElement';
import { LinkedFromContext } from './linkedFrom';

interface ConfigGroup {
  groupUuid: string;
  groupName: string;
  groupDisplayName?: string;
  configurations: { keyUuid: string; key: string; isSensitive?: boolean }[];
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
  /** Config key → resource: configurables a link supplies, shown read-only. */
  linkedFrom?: ReadonlyMap<string, string>;
}

const noLinks: ReadonlyMap<string, string> = new Map();

function SectionAccordion({ title, defaultExpanded = false, children, contentSx, subAccordion = false }: { title: string; defaultExpanded?: boolean; children: React.ReactNode; contentSx?: object; subAccordion?: boolean }) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <Box sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" onClick={() => setOpen((p) => !p)} sx={{ px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none', bgcolor: 'action.hover', borderBottom: open ? 1 : 0, borderColor: 'divider' }}>
        {subAccordion ? (
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {title}
          </Typography>
        ) : (
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        )}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </Stack>
      <Collapse in={open}>
        <Box sx={contentSx}>{children}</Box>
      </Collapse>
    </Box>
  );
}

export function ConfigForm({ schema, valueMap, handleValueChange, validationMap, handleValidationChange, linkingMap, setLinkingMap, sensitiveMap, setSensitiveMap, configGroups, linkedFrom = noLinks }: ConfigFormProps) {
  const [isRequiredKeysInSchema, setIsRequiredKeysInSchema] = useState(false);
  const [isOptionalKeysInSchema, setIsOptionalKeysInSchema] = useState(false);
  const [schemasAtLevel, setSchemasAtLevel] = useState<SchemaAtLevel[]>([]);

  useEffect(() => {
    const targetLevel = schema.requiredLevel || 1;
    const schemas = getSchemasAtLevel(schema, targetLevel);
    setSchemasAtLevel(schemas);

    let hasRequired = false;
    let hasOptional = false;
    schemas.forEach(({ schema: levelSchema }) => {
      if (levelSchema.properties) {
        const required = levelSchema.required || [];
        const allProps = Object.keys(levelSchema.properties);
        if (required.length > 0) hasRequired = true;
        if (allProps.length > required.length) hasOptional = true;
      }
    });
    setIsRequiredKeysInSchema(hasRequired);
    setIsOptionalKeysInSchema(hasOptional);
  }, [schema]);

  const renderConfigElements = (levelSchema: JSONSchema, path: string, requiredOnly: boolean, targetLevel: number) => {
    if (!levelSchema.properties) return null;
    const required = levelSchema.required || [];

    return Object.keys(levelSchema.properties).map((key, _index) => {
      const property = levelSchema.properties![key];
      const type = property.type || 'anyOf';
      const title = property.title || key;
      const fullPath = path ? `${path}.${key}` : key;
      const isKeyRequired = required.includes(key);

      if (requiredOnly && !isKeyRequired) return null;
      if (!requiredOnly && isKeyRequired) return null;

      return (
        <ConfigElement
          key={fullPath}
          title={title}
          type={type}
          schema={levelSchema}
          jsonPath={fullPath}
          propertyKey={key}
          valueMap={valueMap}
          handleValueChange={handleValueChange}
          validationMap={validationMap}
          handleValidationChange={handleValidationChange}
          isRequired={isKeyRequired}
          isRequiredAtRequiredLevel={requiredOnly && targetLevel === 1}
          // Configuration groups aren't served by the BFF, so fields never link to one.
          allowLinking={false}
          configGroups={configGroups}
          linkingMap={linkingMap}
          setLinkingMap={setLinkingMap}
          sensitiveMap={sensitiveMap}
          setSensitiveMap={setSensitiveMap}
        />
      );
    });
  };

  const renderSection = (requiredOnly: boolean) => {
    const targetLevel = schema.requiredLevel || 1;

    return schemasAtLevel.map(({ schema: levelSchema, path }) => {
      if (!levelSchema.properties) return null;
      const required = levelSchema.required || [];
      const hasMatch = Object.keys(levelSchema.properties).some((key) => (requiredOnly ? required.includes(key) : !required.includes(key)));
      if (!hasMatch) return null;

      if (targetLevel === 1) {
        return renderConfigElements(levelSchema, path, requiredOnly, targetLevel);
      }

      return (
        <SectionAccordion key={`${path}-${requiredOnly ? 'required' : 'optional'}`} title={path.replace('.', '/')} defaultExpanded contentSx={{ px: 2, pt: 1, pb: 1 }} subAccordion>
          {renderConfigElements(levelSchema, path, requiredOnly, targetLevel)}
        </SectionAccordion>
      );
    });
  };

  return (
    <LinkedFromContext.Provider value={linkedFrom}>
      {isRequiredKeysInSchema && (
        <SectionAccordion title="Required" defaultExpanded contentSx={{ px: 2, pt: 1.5, pb: 1 }}>
          {renderSection(true)}
        </SectionAccordion>
      )}

      {isOptionalKeysInSchema && (
        <SectionAccordion title="Optional" contentSx={{ px: 2, pt: 1.5, pb: 1.5 }}>
          {renderSection(false)}
        </SectionAccordion>
      )}
    </LinkedFromContext.Provider>
  );
}
