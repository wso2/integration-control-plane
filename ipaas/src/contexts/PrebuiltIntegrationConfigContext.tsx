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

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PrebuiltIntegration } from '../types/prebuilt';
import type { SchemaConfigItem } from '../types/configuration';
import { useFormAbandonment } from '../hooks/useConsoleAnalytics';

interface PrebuiltIntegrationConfigContextValue {
  integration: PrebuiltIntegration | undefined;
  configValues: SchemaConfigItem[];
  setIntegration: (integration: PrebuiltIntegration | undefined) => void;
  setConfigValues: (values: SchemaConfigItem[]) => void;
  clearAll: () => void;
}

const PrebuiltIntegrationConfigContext = createContext<PrebuiltIntegrationConfigContextValue>({
  integration: undefined,
  configValues: [],
  setIntegration: () => {},
  setConfigValues: () => {},
  clearAll: () => {},
});

export function PrebuiltIntegrationConfigProvider({ children }: { children: React.ReactNode }) {
  // The provider spans the setup and deploy pages, so moving from one to the other is not an abandonment.
  useFormAbandonment('prebuilt-integration', 'create-integration');
  const [integration, setIntegration] = useState<PrebuiltIntegration | undefined>(undefined);
  const [configValues, setConfigValues] = useState<SchemaConfigItem[]>([]);

  const clearAll = useCallback(() => {
    setIntegration(undefined);
    setConfigValues([]);
  }, []);

  const value = useMemo(() => ({ integration, configValues, setIntegration, setConfigValues, clearAll }), [integration, configValues, clearAll]);

  return <PrebuiltIntegrationConfigContext.Provider value={value}>{children}</PrebuiltIntegrationConfigContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePrebuiltIntegrationConfig() {
  return useContext(PrebuiltIntegrationConfigContext);
}
