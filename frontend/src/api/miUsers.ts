import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gql } from './graphql';
import { FETCHABLE, settle, unwrap, untilReady, type Fetchable } from './fetchable';

export interface MiUser {
  username: string;
  domain: string;
  isAdmin: boolean;
}

const GET_MI_USERS = `
  query GetMIUsers($componentId: String!, $runtimeId: String!) {
    getMIUsers(componentId: $componentId, runtimeId: $runtimeId) {
      ${FETCHABLE}
      items { username, domain, isAdmin }
    }
  }`;

const ADD_MI_USER = `
  mutation AddMIUser($componentId: String!, $runtimeId: String!, $username: String!, $password: String!, $isAdmin: Boolean, $domain: String, $requestId: String) {
    addMIUser(componentId: $componentId, runtimeId: $runtimeId, username: $username, password: $password, isAdmin: $isAdmin, domain: $domain, requestId: $requestId) {
      ${FETCHABLE}, username, status
    }
  }`;

const DELETE_MI_USER = `
  mutation DeleteMIUser($componentId: String!, $runtimeId: String!, $username: String!, $domain: String, $requestId: String) {
    deleteMIUser(componentId: $componentId, runtimeId: $runtimeId, username: $username, domain: $domain, requestId: $requestId) {
      ${FETCHABLE}, username, status
    }
  }`;

type MiUserOutcome = Fetchable & { username: string; status: string };

const miUsersKey = (componentId: string, runtimeId: string) => ['mi-users', componentId, runtimeId] as const;

export function useListMiUsers(componentId: string, runtimeId: string, enabled = true) {
  return unwrap(
    useQuery({
      queryKey: miUsersKey(componentId, runtimeId),
      queryFn: () => gql<{ getMIUsers: Fetchable & { items: MiUser[] } }>(GET_MI_USERS, { componentId, runtimeId }).then((d) => d.getMIUsers),
      enabled: enabled && !!componentId && !!runtimeId,
      refetchInterval: untilReady,
    }),
    (d) => d.items,
  );
}

export function useCreateMiUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, runtimeId, username, password, isAdmin, domain }: { componentId: string; runtimeId: string; username: string; password: string; isAdmin: boolean; domain: string }) =>
      settle((requestId) => gql<{ addMIUser: MiUserOutcome }>(ADD_MI_USER, { componentId, runtimeId, username, password, isAdmin, domain, requestId }).then((d) => d.addMIUser)),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: miUsersKey(vars.componentId, vars.runtimeId) }),
  });
}

export function useDeleteMiUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, runtimeId, username, domain }: { componentId: string; runtimeId: string; username: string; domain: string }) =>
      settle((requestId) => gql<{ deleteMIUser: MiUserOutcome }>(DELETE_MI_USER, { componentId, runtimeId, username, domain, requestId }).then((d) => d.deleteMIUser)),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: miUsersKey(vars.componentId, vars.runtimeId) }),
  });
}
