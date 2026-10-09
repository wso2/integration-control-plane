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

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type JSX, type SetStateAction } from 'react';
import { useCloudDataPlanes } from '../../hooks/useEnvironments';
import { useOrgs } from '../../hooks/useOrg';
import { copilotApiUrl } from '../../config/runtimeConfig';
import { IS_CLOUD } from '../../features';
import { COPILOT_REGION_DISPLAY_NAMES, COPILOT_SESSION_MESSAGES_KEY } from '../../constants/copilot';
import { useScope } from '../../nav';
import type { CopilotRegion, IMessage } from '../../types/copilot';
import { removeCopilotSessionId } from '../../utils/copilot';

function loadMessagesFromSession(): IMessage[] {
  try {
    const saved = sessionStorage.getItem(COPILOT_SESSION_MESSAGES_KEY);
    return saved ? (JSON.parse(saved) as IMessage[]) : [];
  } catch {
    return [];
  }
}

export interface CopilotContextDefinition {
  showCopilot: boolean;
  setShowCopilot: Dispatch<SetStateAction<boolean>>;
  isCopilotExpanded: boolean;
  setIsCopilotExpanded: Dispatch<SetStateAction<boolean>>;
  messages: IMessage[];
  setMessages: Dispatch<SetStateAction<IMessage[]>>;
  copilotUrl: string;
  selectedRegion: CopilotRegion | null;
  setSelectedRegion: Dispatch<SetStateAction<CopilotRegion | null>>;
  availableRegions: CopilotRegion[];
  isMultiRegionAvailable: boolean;
  isDataPlanesLoading: boolean;
  dataPlanesError: Error | null;
  refetchDataPlanes: () => void;
  messageSendingError: string;
  setMessageSendingError: Dispatch<SetStateAction<string>>;
  chatInputValue: string;
  setChatInputValue: Dispatch<SetStateAction<string>>;
  orgId: string;
  clearChat: () => void;
}

const defaultContext: CopilotContextDefinition = {
  showCopilot: false,
  setShowCopilot: () => {},
  isCopilotExpanded: false,
  setIsCopilotExpanded: () => {},
  messages: [],
  setMessages: () => {},
  copilotUrl: '',
  selectedRegion: null,
  setSelectedRegion: () => {},
  availableRegions: [],
  isMultiRegionAvailable: false,
  isDataPlanesLoading: false,
  dataPlanesError: null,
  refetchDataPlanes: () => {},
  messageSendingError: '',
  setMessageSendingError: () => {},
  chatInputValue: '',
  setChatInputValue: () => {},
  orgId: '',
  clearChat: () => {},
};

// eslint-disable-next-line react-refresh/only-export-components
export const CopilotContext = createContext<CopilotContextDefinition>(defaultContext);

interface CopilotProviderProps {
  children: JSX.Element | JSX.Element[];
}

export function CopilotProvider({ children }: CopilotProviderProps) {
  const [showCopilot, setShowCopilot] = useState(false);
  const [isCopilotExpanded, setIsCopilotExpanded] = useState(false);
  const [messages, setMessages] = useState<IMessage[]>(loadMessagesFromSession);
  const [selectedRegion, setSelectedRegion] = useState<CopilotRegion | null>(null);
  const [availableRegions, setAvailableRegions] = useState<CopilotRegion[]>([]);
  const [isMultiRegionAvailable, setIsMultiRegionAvailable] = useState(false);
  const [messageSendingError, setMessageSendingError] = useState('');
  const [chatInputValue, setChatInputValue] = useState('');
  const [copilotUrl, setCopilotUrl] = useState('');

  const scope = useScope();
  const { data: orgs = [] } = useOrgs();

  const orgId = useMemo(() => orgs.find((o) => o.handle === scope.org)?.uuid ?? '', [orgs, scope.org]);

  const { data: dataPlanes = [], isLoading: isDataPlanesLoading, error: dataPlanesError, refetch: refetchDataPlanes } = useCloudDataPlanes(orgId);

  const clearChat = useCallback(() => {
    setMessages([]);
    setMessageSendingError('');
    setChatInputValue('');
    removeCopilotSessionId();
  }, []);

  // Persist messages to sessionStorage so they survive page refreshes
  useEffect(() => {
    try {
      sessionStorage.setItem(COPILOT_SESSION_MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      // ignore — quota exceeded or sessionStorage unavailable
    }
  }, [messages]);

  // Clear session and reset state when org changes
  const prevOrgRef = useRef(scope.org);
  useEffect(() => {
    if (prevOrgRef.current !== scope.org) {
      removeCopilotSessionId();
      sessionStorage.removeItem(COPILOT_SESSION_MESSAGES_KEY);
      setMessages([]);
      setMessageSendingError('');
      setChatInputValue('');
      setSelectedRegion(null);
      setCopilotUrl('');
      prevOrgRef.current = scope.org;
    }
  }, [scope.org]);

  // Build available regions from data planes
  useEffect(() => {
    if (IS_CLOUD) {
      setAvailableRegions([]);
      return;
    }
    if (!isDataPlanesLoading && dataPlanes.length > 0) {
      const regions: CopilotRegion[] = dataPlanes.map((dp) => ({
        name: COPILOT_REGION_DISPLAY_NAMES[dp.region] ?? dp.region,
        id: dp.id,
        externalVhost: dp.external_gateway_virtual_host,
        copilot_accessible: true,
        disconnected: false,
      }));
      setAvailableRegions(regions);
    }
  }, [dataPlanes, isDataPlanesLoading]);

  // Auto-select region and set multi-region flag
  useEffect(() => {
    if (!isDataPlanesLoading && availableRegions.length > 0) {
      setIsMultiRegionAvailable(availableRegions.length > 1);
      if (!selectedRegion) {
        setSelectedRegion(availableRegions[0]);
      }
    }
  }, [availableRegions, isDataPlanesLoading, selectedRegion]);

  // Derive copilot URL from selected region
  useEffect(() => {
    if (selectedRegion?.externalVhost) {
      setCopilotUrl(copilotApiUrl(selectedRegion.externalVhost));
    } else {
      setCopilotUrl('');
    }
  }, [selectedRegion]);

  const value = useMemo<CopilotContextDefinition>(
    () => ({
      showCopilot,
      setShowCopilot,
      isCopilotExpanded,
      setIsCopilotExpanded,
      messages,
      setMessages,
      copilotUrl,
      selectedRegion,
      setSelectedRegion,
      availableRegions,
      isMultiRegionAvailable,
      isDataPlanesLoading,
      dataPlanesError: dataPlanesError as Error | null,
      refetchDataPlanes,
      messageSendingError,
      setMessageSendingError,
      chatInputValue,
      setChatInputValue,
      orgId,
      clearChat,
    }),
    [messages, copilotUrl, selectedRegion, availableRegions, isMultiRegionAvailable, isDataPlanesLoading, dataPlanesError, refetchDataPlanes, showCopilot, isCopilotExpanded, messageSendingError, chatInputValue, orgId, clearChat],
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}
