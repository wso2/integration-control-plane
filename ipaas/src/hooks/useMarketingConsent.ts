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

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { fetchMarketingConsent, recordMarketingConsent } from '../api/marketingConsent';
import type { ConsentDecision, MarketingConsent } from '../types/marketingConsent';

const KEY = ['marketingConsent'] as const;

/**
 * The signed-in person's marketing consent. Read once per session: it only changes when they answer,
 * and the read can take several seconds (platform-api allows 12). Not retried: a 404 means consent is
 * not configured in this environment, and any failure only means the prompt is not shown.
 */
export function useMarketingConsent(): UseQueryResult<MarketingConsent> {
  return useQuery<MarketingConsent>({
    queryKey: KEY,
    queryFn: fetchMarketingConsent,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Records the person's answer. The cached record takes the answer on success instead of being
 * refetched: platform-api accepts the decision before Pardot has it, so a read straight after can
 * still say `No Opt-in` and would ask again.
 */
export function useRecordMarketingConsent() {
  const qc = useQueryClient();
  return useMutation<void, Error, ConsentDecision>({
    mutationFn: recordMarketingConsent,
    onSuccess: (_, decision) => qc.setQueryData<MarketingConsent>(KEY, (prev) => prev && { ...prev, consentStatus: decision }),
  });
}
