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

import { OrganizationUnitSwitcher, type AccessibleOrganizationUnit } from '@thunderid/react';
import { useState, type JSX, type ReactNode } from 'react';
import { OrganizationSwitchError, loadConsolePage, switchOrganization } from './orgSwitch';

/** What the organization list hands its child: the organizations and how to switch to one. */
export interface OrganizationSwitchState {
  organizationUnits: AccessibleOrganizationUnit[];
  /** Why the last switch failed, for the user, or `null`. */
  error: string | null;
  /** The organization being switched to, or `null`. Stays set once the switch succeeds, while the page reloads. */
  switchingId: string | null;
  /**
   * Switches to `unit`, then loads `landingPath` (an app path in `unit`); `currentId` is where the sessions
   * go back to if a step fails. The promise settles
   * only when the switch fails: on success the console reloads, so it never does, which keeps a leave
   * guard released (useLeaveGuard) until the page has gone.
   */
  onSwitch: (unit: AccessibleOrganizationUnit, currentId: string, landingPath: string) => Promise<void>;
}

/** How many organizations the header asks for at once. */
const LISTED = 50;

const switchFailure = (error: unknown, name: string): string => {
  const reason = error instanceof OrganizationSwitchError ? error.reason : 'failed';
  if (reason === 'forbidden') return `You don't have access to ${name}.`;
  // Part of WSO2 Cloud is already in the new organization; picking it again finishes the move.
  if (reason === 'incomplete') return `Switching to ${name} didn't finish. Pick ${name} again to complete it.`;
  return `Couldn't switch to ${name}. Try again.`;
};

/**
 * The organizations the signed-in user belongs to (Thunder's `/users/me/ous`, siblings of the current
 * one), for a custom picker. A pick moves the cloud console's session and this console's to that organization
 * (switchOrganization) and then reloads the console in it.
 */
export function OrganizationList({ children }: { children: (state: OrganizationSwitchState) => ReactNode }): JSX.Element {
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSwitch = (unit: AccessibleOrganizationUnit, currentId: string, landingPath: string): Promise<void> => {
    if (switchingId !== null) return Promise.resolve();
    setError(null);
    setSwitchingId(unit.id);
    return switchOrganization(unit.id, currentId).then(
      () => {
        loadConsolePage(landingPath);
        return new Promise<void>(() => {});
      },
      (failure: unknown) => {
        setError(switchFailure(failure, unit.name));
        setSwitchingId(null);
      },
    );
  };

  // The SDK only lists here: onSelect takes the pick over, so the SDK's own single-endpoint switch never runs.
  return (
    <OrganizationUnitSwitcher scope="siblings" limit={LISTED} onSelect={() => undefined}>
      {({ organizationUnits }) => children({ organizationUnits, error, switchingId, onSwitch })}
    </OrganizationUnitSwitcher>
  );
}
