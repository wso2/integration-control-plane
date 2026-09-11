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

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type JSX, type ReactNode } from 'react';
import { getTimeZonePreference, setTimeZonePreference, zoneLabel, type TimeZonePreference } from '../utils/time';

// The clock the workflow pages show times on — local or UTC — chosen once per browser.
interface TimeZoneState {
  zone: TimeZonePreference;
  label: string;
  setZone: (zone: TimeZonePreference) => void;
  toggle: () => void;
}

const TimeZoneContext = createContext<TimeZoneState | null>(null);

export function TimeZoneProvider({ children }: { children: ReactNode }): JSX.Element {
  const [zone, setZoneState] = useState<TimeZonePreference>(getTimeZonePreference);
  // Plain string formatting outside React reads the same zone.
  useEffect(() => setTimeZonePreference(zone), [zone]);
  const setZone = useCallback((z: TimeZonePreference) => setZoneState(z), []);
  const toggle = useCallback(() => setZoneState((z) => (z === 'utc' ? 'local' : 'utc')), []);
  const value = useMemo<TimeZoneState>(() => ({ zone, label: zoneLabel(zone), setZone, toggle }), [zone, setZone, toggle]);
  return <TimeZoneContext.Provider value={value}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone(): TimeZoneState {
  const ctx = useContext(TimeZoneContext);
  return ctx ?? { zone: 'local', label: zoneLabel('local'), setZone: () => {}, toggle: () => {} };
}
