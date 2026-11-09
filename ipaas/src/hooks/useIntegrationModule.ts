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

import { useEffect, useState } from 'react';
import type { IntegrationModule, IntegrationType } from '../types/integration';
import { integrationModuleLoaders } from '../components/Overview/registry';
import UserPortalSharedAction from '../components/Overview/_shared/UserPortalSharedAction';
import { USER_PORTAL_TYPES } from '../constants/userPortal';

// The types the User Portal shows get its action in each env card's footer.
const withUserPortal = (type: IntegrationType, module: IntegrationModule): IntegrationModule => (USER_PORTAL_TYPES.has(type) ? { ...module, EnvCardSharedAction: UserPortalSharedAction } : module);

/**
 * Lazily loads the Overview module (one chunk per integration type) for a
 * resolved type. Resolved **once** here and shared by every consumer that
 * needs the module — the env-card renderer (`IntegrationRenderer`) and the
 * component header (`HeaderShell`) — so neither re-resolves the type itself.
 *
 * Returns `null` while the chunk loads (consumers show a skeleton / fall back
 * to their generic frame). The dynamic import is an external system, so an
 * effect is the right tool here — not a render-time derivation.
 */
export function useIntegrationModule(type: IntegrationType | null | undefined): IntegrationModule | null {
  const [module, setModule] = useState<IntegrationModule | null>(null);

  useEffect(() => {
    if (!type) {
      setModule(null);
      return;
    }
    let cancelled = false;
    setModule(null);
    integrationModuleLoaders[type]()
      .then((loaded) => {
        if (!cancelled) setModule(withUserPortal(type, loaded.default));
      })
      .catch(() => {
        // The registry points every type at a real loader, so a failure means
        // a broken bundle (a deploy gate would catch it); leave module null.
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  return module;
}
