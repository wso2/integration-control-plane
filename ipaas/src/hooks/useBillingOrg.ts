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
import { fetchBillingOrg, fetchBillingPlan } from '../api/billing';
import type { BillingOrg, BillingPlan } from '../types/billing';

/** Billing org record for the subscription/trial chip. */
export function useBillingOrg(product: string): { org: BillingOrg | null; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['billingOrg', product],
    queryFn: (): Promise<BillingOrg> => fetchBillingOrg(product),
    enabled: !!product,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return { org: data ?? null, isLoading };
}

/**
 * A plan of the billing catalog, read by its code to learn whether it is paid. Plans change only
 * with a catalog release, so the result is kept for the session rather than refetched.
 */
export function useBillingPlan(code: string | undefined): { plan: BillingPlan | null; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['billingPlan', code],
    queryFn: (): Promise<BillingPlan> => fetchBillingPlan(code ?? ''),
    enabled: !!code,
    staleTime: Infinity,
    retry: false,
  });
  return { plan: data ?? null, isLoading };
}
