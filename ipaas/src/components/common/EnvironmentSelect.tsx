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

import { MenuItem, Select, Stack } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import EnvStatusDot from './EnvStatusDot';
import { PILL_SELECT_SX } from '../../constants/styles';

interface EnvironmentSelectProps {
  environments: { id: string; name: string }[];
  /** The selected environment id. */
  value: string;
  onChange: (environmentId: string) => void;
  /**
   * Identifies the deployment to read each environment's status from. Supply it to get
   * status dots beside the environment names; omit it and the picker stays plain, for
   * callers with no deployment in scope.
   */
  deployment?: {
    orgHandler: string;
    orgUuid: string;
    componentId: string;
    /** Deployment track id — `versionId` in the deployments API; undefined while the page hasn't resolved it. */
    versionId: string | undefined;
  };
}

/** Compact environment picker used in the deployment-track bar of ComponentScope pages. */
export default function EnvironmentSelect({ environments, value, onChange, deployment }: EnvironmentSelectProps): JSX.Element {
  const selected = environments.some((e) => e.id === value) ? value : '';
  const label = (envId: string, name: string): JSX.Element =>
    deployment ? (
      <Stack direction="row" alignItems="center" gap={0.75}>
        <EnvStatusDot {...deployment} envId={envId} />
        {name}
      </Stack>
    ) : (
      <>{name}</>
    );

  return (
    <Select
      size="small"
      value={selected}
      onChange={(e) => onChange(e.target.value as string)}
      renderValue={
        deployment
          ? (v) => {
              const env = environments.find((e) => e.id === v);
              return env ? label(env.id, env.name) : null;
            }
          : undefined
      }
      inputProps={{ 'aria-label': 'Environment' }}
      sx={{ ...PILL_SELECT_SX, minWidth: 60 }}>
      {environments.map((e) => (
        <MenuItem key={e.id} value={e.id}>
          {label(e.id, e.name)}
        </MenuItem>
      ))}
    </Select>
  );
}
