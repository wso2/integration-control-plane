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
import { useAuth } from '../auth';
import type { ConsentDecision, MarketingConsent } from '../types/marketingConsent';
import { withSessionAnswer } from '../utils/marketingConsent';
import { session } from '../utils/storage';

const key = (userId: string) => ['marketingConsent', userId] as const;

// The answer saved in this tab, per person. platform-api accepts a decision before Pardot has it, so
// a read straight after, a reload included, can still say `No Opt-in` and would ask again.
const answeredKey = (userId: string) => `marketing_consent_answered:${userId}`;

/**
 * The signed-in person's marketing consent. Read once per session: it only changes when they answer,
 * and the read can take several seconds (platform-api allows 12). Not retried: a 404 means consent is
 * not configured in this environment, and any failure only means the prompt is not shown.
 */
export function useMarketingConsent(): UseQueryResult<MarketingConsent> {
  const { userId } = useAuth();
  return useQuery<MarketingConsent>({
    queryKey: key(userId),
    queryFn: async () => withSessionAnswer(await fetchMarketingConsent(), session.get(answeredKey(userId))),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Records the person's answer. On success the answer goes into the cached record and into this tab's
 * session instead of being refetched, so neither Pardot's delay nor a reload asks again.
 */
export function useRecordMarketingConsent() {
  const qc = useQueryClient();
  const { userId } = useAuth();
  return useMutation<void, Error, ConsentDecision>({
    mutationFn: recordMarketingConsent,
    onSuccess: (_, decision) => {
      session.set(answeredKey(userId), decision);
      qc.setQueryData<MarketingConsent>(key(userId), (prev) => prev && { ...prev, consentStatus: decision });
    },
  });
}
