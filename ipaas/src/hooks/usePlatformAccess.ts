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

import { useQuery } from '@tanstack/react-query';
import { fetchBillingPlans, fetchBillingSubscriptions } from '../api/billing';
import { platformAccess, type PlatformAccess } from '../utils/platformAccess';

/**
 * The org's access to each billed platform, for the platform switcher. Asked only once the switcher is opened.
 * Without billing, or when billing fails, every platform reads 'unknown' and opens directly.
 */
export function usePlatformAccess(fetch: boolean): { accessFor: (code: string) => PlatformAccess; isLoading: boolean } {
  const enabled = fetch && !!window.API_CONFIG?.billingApiBaseUrl;
  const plans = useQuery({ queryKey: ['billingPlans'], queryFn: fetchBillingPlans, enabled, staleTime: 5 * 60 * 1000, retry: false });
  const subscriptions = useQuery({ queryKey: ['billingSubscriptions'], queryFn: fetchBillingSubscriptions, enabled, staleTime: 60 * 1000, retry: false });

  if (!enabled || plans.isError || subscriptions.isError || !plans.data || !subscriptions.data) {
    return { accessFor: () => 'unknown', isLoading: enabled && (plans.isLoading || subscriptions.isLoading) };
  }
  const subs = subscriptions.data;
  const catalog = plans.data;
  return { accessFor: (code) => platformAccess(code, subs, catalog), isLoading: false };
}
