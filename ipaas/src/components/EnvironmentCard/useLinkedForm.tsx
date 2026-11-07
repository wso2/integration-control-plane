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

import { useMemo, type ReactNode } from 'react';
import { Alert, Button, Stack, Typography } from '@wso2/oxygen-ui';
import { BffError } from '../../api/_client';
import { useEnvironments } from '../../hooks/useEnvironments';
import { useConnectableEndpoints, useIntegrationLinks, useLinkWrite } from '../../hooks/useConfiguration';
import type { IntegrationLinks, LinkTarget } from '../../types/configuration';
import { configKey, configurableId, formLinkView, targetName } from '../../utils/integrationLinks';
import { ConnectionLink } from './ConnectionLink';
import { OrphanedLinks } from './OrphanedLinks';
import type { FormGroup } from '../SchemaConfigForm/ConfigForm';
import type { FieldLinks } from '../SchemaConfigForm/linkedFrom';

const noLinks: IntegrationLinks = { kind: 'ballerina', resources: [], used: {}, usedByOrphaned: {}, connections: [], fieldLinks: {}, endpointLinks: {}, orphaned: [], env: {}, environments: [] };

/** One pick of a field's link icon as a link write: a resource key, an endpoint of this project, or neither, which unlinks the field. */
const pickedTarget = (configurable: string, pick: { resource: string; key: string } | { endpoint: string } | null): LinkTarget => {
  if (pick && 'endpoint' in pick) return { configurable, endpoint: pick.endpoint };
  if (pick) return { configurable, ref: pick.resource, key: pick.key };
  return { configurable };
};

/** A Configure form's links in env: the connection boxes, each field's link, the links the build lost, and the config keys a link fills. `fields` are the build's linkable config keys (`linkableFields`). */
export function useLinkedForm(projectId: string, componentId: string, env: string, open: boolean, fields: string[]) {
  const read = useIntegrationLinks(projectId, componentId, open);
  const links = read.data ?? noLinks;
  // Until the links read, the form can't tell linked fields from others: it offers no link action and no save.
  const linksUnread = !read.data || read.isError;
  const { data: environments = [] } = useEnvironments('', projectId);
  const envName = (id: string) => environments.find((e) => e.id === id)?.name ?? id;
  const { data: connectable = [] } = useConnectableEndpoints(projectId, componentId, open);
  const ids = fields.map(configurableId).join();
  const view = useMemo(() => formLinkView(links, env, envName, ids ? ids.split(',') : [], connectable), [links, env, environments, ids, connectable]); // eslint-disable-line react-hooks/exhaustive-deps
  const write = useLinkWrite();
  const change = (target: LinkTarget) => write.mutateAsync({ projectId, componentId, target }).catch(() => undefined);

  const linkable = new Set(fields);
  const fieldLinks: FieldLinks = (path) => {
    // A member of a record, map or array is no configurable of its own: nothing links it.
    if (!linkable.has(path)) return undefined;
    const id = configurableId(path);
    const t = view.target(id);
    return {
      ...(t.source && {
        source: {
          resource: t.source.name,
          key: t.source.key,
          ...(t.source.endpoint && { endpoint: true }),
          ...(t.source.overrides && { overrides: true }),
          ...(t.source.noValues && { noValuesIn: envName(env) }),
          ...(t.source.declared && { declared: true }),
        },
      }),
      ...(t.picker && { picker: { ...t.picker, disabled: write.isPending || linksUnread, onPick: (pick) => change(pickedTarget(id, pick)) } }),
    };
  };

  const groups: FormGroup[] = view.connections.map(({ connection: c, linked, note }) => ({
    id: c.id,
    title: (
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>
          {targetName(c.id)}
        </Typography>
        {!view.editable && linked && (
          <Typography variant="caption" color="text.secondary">
            Linked to {linked.displayName}
          </Typography>
        )}
      </Stack>
    ),
    actions: view.editable && !view.sourceDefined && <ConnectionLink connection={c} links={links} busy={write.isPending || linksUnread} onLink={(ref) => change(ref ? { connection: c.id, ref } : { connection: c.id })} />,
    note: note && (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {note}
      </Typography>
    ),
    keys: c.fields.map((f) => configKey(f.configurable)),
  }));

  const linkedKeys = new Set(
    [...Object.keys(links.fieldLinks), ...Object.keys(links.declared ?? {}), ...links.connections.flatMap((c) => c.fields.map((f) => f.configurable)), ...Object.keys(links.environments.find((e) => e.name === env)?.configurables ?? {})]
      .filter((id) => view.target(id).source)
      .map(configKey),
  );

  const top: ReactNode = (
    <>
      {read.isError && (
        <Alert
          severity="error"
          sx={{ mb: 1.5 }}
          action={
            <Button size="small" color="inherit" disabled={read.isFetching} onClick={() => void read.refetch()}>
              Try again
            </Button>
          }>
          {read.data ? "Couldn't refresh this integration's links. These are from the last read." : "Couldn't read this integration's links."}
        </Alert>
      )}
      {view.sourceDefined && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Links come from workload.yaml in the repository.
        </Typography>
      )}
      {view.editable && view.orphaned.length > 0 && <OrphanedLinks view={view} connections={links.connections.map((c) => c.id)} configurables={fields.map(configurableId)} busy={write.isPending || linksUnread} change={change} />}
      {write.data?.workload === 'next_deploy' && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Deploy to apply.
        </Alert>
      )}
      {write.isError && (
        <Alert
          severity="error"
          sx={{ mb: 1.5 }}
          action={
            // A refusal stays one; a write the platform didn't finish finishes when repeated.
            write.variables &&
            !(write.error instanceof BffError && write.error.status < 500) && (
              <Button size="small" color="inherit" onClick={() => change(write.variables!.target)}>
                Try again
              </Button>
            )
          }>
          {write.error instanceof Error ? write.error.message : "Linking didn't finish."}
        </Alert>
      )}
    </>
  );

  // Outside the first environment the form shows the release's build; with its schema unread, it shows no other build's.
  const schemaUnread = links.environments.length > 0 && !view.editable ? `Couldn't read the configurables of the build ${envName(env)} runs.` : undefined;

  return { links, view, groups, fieldLinks, linkedKeys, top, unread: schemaUnread, linksLoading: read.isLoading, linksUnread, linksMissing: !read.data && read.isError };
}
