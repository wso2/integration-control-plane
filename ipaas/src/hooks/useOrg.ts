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

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDefaultProject, fetchOrgComponentLimits, fetchOrgSubscriptions, fetchOrgs, fetchProjectsByOrgId, initOrg, registerUser, validateOrgName } from '#api/org';
import { trackEvent } from '../utils/tracking';

export function useOrgs() {
  return useQuery({
    queryKey: ['orgs'],
    queryFn: fetchOrgs,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOrgComponentLimits(orgUuid: string) {
  return useQuery({
    queryKey: ['orgComponentLimits', orgUuid],
    queryFn: () => fetchOrgComponentLimits(orgUuid),
    enabled: !!orgUuid,
    staleTime: 30 * 1000,
  });
}

export function useOrgSubscriptions(orgUuid: string) {
  return useQuery({
    queryKey: ['orgSubscriptions', orgUuid],
    queryFn: () => fetchOrgSubscriptions(orgUuid),
    enabled: !!orgUuid,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

export function useProjectsByOrgId(orgNumericId: number, enabled = true) {
  return useQuery({
    queryKey: ['projects-by-org', orgNumericId],
    queryFn: () => fetchProjectsByOrgId(orgNumericId),
    enabled: enabled && orgNumericId > 0,
  });
}

// Imperative fetcher for use in event flows (login callbacks etc.) — shares cache with useProjectsByOrgId.
export function useFetchProjectsByOrgId() {
  const qc = useQueryClient();
  return useCallback(
    (orgNumericId: number) =>
      qc.fetchQuery({
        queryKey: ['projects-by-org', orgNumericId],
        queryFn: () => fetchProjectsByOrgId(orgNumericId),
      }),
    [qc],
  );
}

export function useInitOrg() {
  return useMutation({
    mutationFn: ({ orgUuid, region }: { orgUuid: string; region: string }) => initOrg(orgUuid, region),
  });
}

export function useCreateDefaultProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgNumericId, orgHandler, projectHandler }: { orgNumericId: number; orgHandler: string; projectHandler?: string }) => {
      trackEvent('project-create-start');
      return createDefaultProject(orgNumericId, orgHandler, projectHandler);
    },
    // Without this, AppLayout's own useProjects() call (already mounted throughout onboarding)
    // keeps serving the pre-creation project list — so the page OrgHome navigates to right after
    // this succeeds reads a stale, empty list, finds no matching project, and briefly renders
    // "Project not found" before a later refetch (if any) corrects it.
    onSuccess: () => {
      trackEvent('project-create-end');
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useValidateOrgName() {
  return useMutation({
    mutationFn: (orgName: string) => validateOrgName(orgName),
  });
}

export function useRegisterUser() {
  return useMutation({
    mutationFn: ({ orgName, termsAccepted, serviceName }: { orgName: string; termsAccepted: boolean; serviceName: string }) => registerUser(orgName, termsAccepted, serviceName),
  });
}
