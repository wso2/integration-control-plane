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
import { getComponentLimits, getSubscriptions } from '../../api/subscriptions';
import type { ComponentLimits, SubscriptionList } from '../../types/subscription';

// Subscriptions are not served by the BFF yet (the API stubs reject), so both queries stay off
// until the feature is ported.
const SUBSCRIPTIONS_SERVED = false;

export function useSubscriptions(orgUuid: string, enabled = true) {
  return useQuery<SubscriptionList>({
    queryKey: ['subscriptions', orgUuid],
    queryFn: () => getSubscriptions(orgUuid),
    enabled: SUBSCRIPTIONS_SERVED && enabled && !!orgUuid,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useComponentLimits(orgUuid: string, enabled = true) {
  return useQuery<ComponentLimits>({
    queryKey: ['componentLimits', orgUuid],
    queryFn: () => getComponentLimits(orgUuid),
    enabled: SUBSCRIPTIONS_SERVED && enabled && !!orgUuid,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
