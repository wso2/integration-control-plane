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

import { useState, useEffect, useRef } from 'react';
import { useProjectHandlerAvailability } from './useProjects';
import type { ProjectHandlerAvailability } from '../types/project';
import { HANDLER_DEBOUNCE_MS, PROJECT_HANDLER_MAX_LENGTH } from '../constants/project';
import { toProjectHandler, withRandomSuffix } from '../utils/string';

export interface UseProjectHandlerReturn {
  handler: string;
  handlerEdited: boolean;
  isCheckingAvailability: boolean;
  availability: ProjectHandlerAvailability | undefined;
  availabilityError: boolean;
  startEditing: () => void;
  stopEditing: () => void;
  onHandlerChange: (value: string) => void;
}

export function useProjectHandler(displayName: string): UseProjectHandlerReturn {
  const [handlerEdited, setHandlerEdited] = useState(false);
  const [manualHandler, setManualHandler] = useState('');
  const [debouncedCandidate, setDebouncedCandidate] = useState('');
  // A free handle swapped in for a taken one, kept only while `base` is still the requested handle.
  const [replacement, setReplacement] = useState<{ base: string; handler: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoHandler = toProjectHandler(displayName, PROJECT_HANDLER_MAX_LENGTH);
  // Use manualHandler when set (confirmed or in-progress override), otherwise fall back to auto.
  const requestedHandler = manualHandler || autoHandler;
  const effectiveHandler = replacement?.base === requestedHandler ? replacement.handler : requestedHandler;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!effectiveHandler || effectiveHandler.length < 2) {
      setDebouncedCandidate('');
      return;
    }
    debounceRef.current = setTimeout(() => setDebouncedCandidate(effectiveHandler), HANDLER_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [effectiveHandler]);

  const { data: availability, isFetching: isCheckingAvailability, isError: availabilityError } = useProjectHandlerAvailability(debouncedCandidate, debouncedCandidate.length >= 2);

  // A taken handle becomes the BFF's suggestion, else gets a random suffix.
  useEffect(() => {
    if (!availability || availability.handlerUnique || debouncedCandidate !== effectiveHandler) return;
    setReplacement({ base: requestedHandler, handler: availability.alternateHandlerCandidate || withRandomSuffix(effectiveHandler, PROJECT_HANDLER_MAX_LENGTH) });
  }, [availability, debouncedCandidate, effectiveHandler, requestedHandler]);

  const startEditing = () => {
    setHandlerEdited(true);
    setManualHandler(effectiveHandler);
  };

  const stopEditing = () => {
    setHandlerEdited(false);
    // Keep manualHandler — it is now the confirmed override.
  };

  const onHandlerChange = (value: string) => {
    setManualHandler(value);
  };

  return {
    handler: effectiveHandler,
    handlerEdited,
    isCheckingAvailability,
    availability,
    availabilityError,
    startEditing,
    stopEditing,
    onHandlerChange,
  };
}
