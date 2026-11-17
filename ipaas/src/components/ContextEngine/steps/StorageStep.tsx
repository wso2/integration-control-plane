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

import { Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useEngineManagedServer } from '../../../hooks/useContextEngine';
import DatabaseSection from './DatabaseSection';
import { stepHeadingSx, stepHintSx } from '../styles';
import type { DatabaseChoice, EngineManagedServer } from '../../../types/contextEngine';

interface StorageStepProps {
  database: DatabaseChoice;
  onDatabaseChange: (value: DatabaseChoice) => void;
}

const MANAGED_HINT: Record<EngineManagedServer, string> = {
  embedded: 'The defaults are built in and need no setup.',
  postgres: 'Engine managed stores run on the engine’s own PostgreSQL server, created and deleted with it, and need no setup.',
};

/** Step 4 — where the engine keeps its data: a database WSO2 Cloud manages, or the user's own PostgreSQL. */
export default function StorageStep({ database, onDatabaseChange }: StorageStepProps): JSX.Element {
  const managedServer = useEngineManagedServer();

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Configure storage
      </Typography>
      <Typography variant="body2" sx={stepHintSx}>
        Where the engine keeps its data.
      </Typography>

      <DatabaseSection value={database} onChange={onDatabaseChange} managedHint={managedServer.data ? MANAGED_HINT[managedServer.data] : undefined} />
    </>
  );
}
