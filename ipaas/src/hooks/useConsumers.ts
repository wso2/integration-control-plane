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

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { createConsumer, createEndpointTestKey, deleteConsumer, fetchConsumers, getEndpointPolicies, getEndpointSecurity, regenerateConsumerToken, revokeConsumer, setEndpointPolicies, setEndpointSecurity } from '../api/consumers';
import type { ApiKeyResult, Consumer, CreateConsumerInput, EndpointPolicyConfig, EndpointRef, SecurityConfig, ConsumerCredential } from '../types/consumers';

/** Endpoint refs are only usable once every segment is known. */
const isCompleteRef = (ref: EndpointRef | null | undefined): ref is EndpointRef => !!ref?.projectName && !!ref.componentName && !!ref.environmentName && !!ref.endpointName;

const refKey = (ref: EndpointRef | null | undefined) => [ref?.projectName ?? '', ref?.componentName ?? '', ref?.environmentName ?? '', ref?.endpointName ?? ''] as const;

const consumersKey = (projectName: string | null | undefined, ref: EndpointRef | null | undefined) => ['consumers', projectName ?? '', ...refKey(ref)] as const;

// ---------------------------------------------------------------------------
// Consumers
// ---------------------------------------------------------------------------

export function useConsumers(projectName: string | null | undefined, ref: EndpointRef | null | undefined) {
  return useQuery<Consumer[]>({
    queryKey: consumersKey(projectName, ref),
    queryFn: () => fetchConsumers(ref!, projectName ?? undefined),
    enabled: isCompleteRef(ref),
    staleTime: 30_000,
    retry: false,
  });
}

/** The plaintext key is returned once. */
export function useCreateConsumer(projectName: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<Consumer, Error, CreateConsumerInput>({
    mutationFn: (input) => createConsumer(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: consumersKey(projectName, vars) });
    },
  });
}

/** Re-issue the api-key in place. The new plaintext is returned once. */
export function useRegenerateConsumerToken(projectName: string | null | undefined, ref: EndpointRef | null | undefined) {
  const qc = useQueryClient();
  return useMutation<ConsumerCredential, Error, Consumer>({
    mutationFn: (consumer) => regenerateConsumerToken(ref!, consumer),
    // The revoke lands before the re-mint, so the old key is gone even on failure.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: consumersKey(projectName, ref) });
    },
  });
}

/** Revoke the api-key, keeping the consumer in the list. */
export function useRevokeConsumer(projectName: string | null | undefined, ref: EndpointRef | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, Consumer>({
    mutationFn: (consumer) => revokeConsumer(ref!, consumer),
    // Keys are revoked in parallel, so a partial failure still changes server state.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: consumersKey(projectName, ref) });
    },
  });
}

/** Revoke the api-key *and* remove the application. */
export function useDeleteConsumer(projectName: string | null | undefined, ref: EndpointRef | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, Consumer>({
    mutationFn: (consumer) => deleteConsumer(ref!, consumer),
    // A partial failure still changes server state.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: consumersKey(projectName, ref) });
    },
  });
}

// ---------------------------------------------------------------------------
// Endpoint security — single active auth mode
// ---------------------------------------------------------------------------

const securityKey = (ref: EndpointRef | null | undefined) => ['endpoint-security', ...refKey(ref)] as const;

/** Read the exposed API's active auth mode so the security drawer reflects real state. */
export function useEndpointSecurity(ref: EndpointRef | null | undefined, enabled = true) {
  return useQuery<SecurityConfig>({
    queryKey: securityKey(ref),
    queryFn: () => getEndpointSecurity(ref!),
    enabled: enabled && isCompleteRef(ref),
    staleTime: 30_000,
    retry: false,
  });
}

/** Several endpoints' security at once, sharing the single-endpoint cache. */
export function useEndpointSecurities(refs: EndpointRef[]) {
  return useQueries({
    queries: refs.map((ref) => ({
      queryKey: securityKey(ref),
      queryFn: () => getEndpointSecurity(ref),
      enabled: isCompleteRef(ref),
      staleTime: 30_000,
      retry: false,
    })),
  });
}

/** Set the exposed API's active auth mode (none/api-key/jwt). */
export function useSetEndpointSecurity(ref: EndpointRef | null | undefined) {
  const qc = useQueryClient();
  return useMutation<SecurityConfig, Error, SecurityConfig>({
    mutationFn: (cfg) => setEndpointSecurity(ref!, cfg),
    onSuccess: (data) => {
      qc.setQueryData<SecurityConfig>(securityKey(ref), (prev) => ({ ...prev, ...data }));
    },
  });
}

// ---------------------------------------------------------------------------
// Endpoint policies — CORS and rate limiting
// ---------------------------------------------------------------------------

const policiesKey = (ref: EndpointRef | null | undefined) => ['endpoint-policies', ...refKey(ref)] as const;

/** Read the exposed API's CORS and rate-limit configuration. */
export function useEndpointPolicies(ref: EndpointRef | null | undefined, enabled = true) {
  return useQuery<EndpointPolicyConfig>({
    queryKey: policiesKey(ref),
    queryFn: () => getEndpointPolicies(ref!),
    enabled: enabled && isCompleteRef(ref),
    staleTime: 30_000,
    retry: false,
  });
}

/** Replace the exposed API's CORS and rate-limit configuration. */
export function useSetEndpointPolicies(ref: EndpointRef | null | undefined) {
  const qc = useQueryClient();
  return useMutation<EndpointPolicyConfig, Error, EndpointPolicyConfig>({
    mutationFn: (cfg) => setEndpointPolicies(ref!, cfg),
    onSuccess: (data) => {
      qc.setQueryData(policiesKey(ref), data);
    },
  });
}

/**
 * Mint a short-lived (1h) test key for the exposed API. The plaintext is
 * returned once and is sent as the `api-key-auth` header, which this route also
 * turns on if it is off.
 */
export function useCreateEndpointTestKey(ref: EndpointRef | null | undefined) {
  return useMutation<ApiKeyResult, Error, void>({
    mutationFn: () => createEndpointTestKey(ref!),
  });
}
