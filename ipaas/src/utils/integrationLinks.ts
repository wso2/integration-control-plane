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

import type { EnvironmentLinks, IntegrationLinks, KeyRef, LinkableResource, LinkConnection, OrphanedLink } from '../types/configuration';

/** `acme.ghdemo.githubAuthToken` → `acme/ghdemo:githubAuthToken`; a submodule joins its package with a dot. */
export const configurableId = (configKey: string): string => {
  const parts = configKey.split('.');
  return `${parts[0]}/${parts.slice(1, -1).join('.')}:${parts[parts.length - 1]}`;
};

/** `acme/ghdemo:githubAuthToken` → `acme.ghdemo.githubAuthToken`. */
export const configKey = (id: string): string => id.replace('/', '.').replace(':', '.');

/** A target's name: a configurable's or connection's without `<org>/<module>:`, an env var's as it is. */
export const targetName = (target: string): string => target.slice(target.lastIndexOf(':') + 1);

export const VIA = 'Via selected Link';
export const ENTER = 'Enter a value';

export interface FieldSource extends KeyRef {
  /** The resource's display name. */
  name: string;
  /** An own link that beats its connection's. */
  overrides?: boolean;
  noValues: boolean;
  /** Declared in workload.yaml. */
  declared?: boolean;
}

export interface Picker {
  first: typeof VIA | typeof ENTER;
  /** `first`, or `<resource>|<KEY>`. */
  selected: string;
  resources: { id: string; name: string; keys: { key: string; usedBy?: string; orphanOf?: string }[] }[];
}

/** One target's link in a form: where its value comes from, and the picker's choices where links can change. */
export interface TargetView {
  source?: FieldSource;
  picker?: Picker;
}

export interface ConnectionView {
  connection: LinkConnection;
  linked?: LinkableResource;
  /** Outside the first environment: what the release uses, and the link now. */
  note?: string;
}

export interface FormLinkView {
  editable: boolean;
  /** workload.yaml declares the resources: nothing links here. */
  sourceDefined: boolean;
  connections: ConnectionView[];
  /** By configurable id, or env var name for MI. */
  target: (target: string) => TargetView;
  orphaned: (OrphanedLink & { name: string })[];
}

/**
 * The links of a Configure form in env: editable in the first environment, else what env's release uses, read-only.
 * `fields` are the configurable ids of the build env runs: outside the first environment its sections come from them.
 */
export function formLinkView(links: IntegrationLinks, env: string, envName: (env: string) => string = (e) => e, fields: string[] = []): FormLinkView {
  const first = links.environments[0]?.name;
  const editable = first === env;
  const release = links.environments.find((e) => e.name === env);
  const resource = (id: string) => links.resources.find((r) => r.id === id);
  const name = (id: string) => resource(id)?.displayName ?? id;
  const source = (ref: KeyRef, overrides?: boolean): FieldSource => ({ ...ref, name: name(ref.ref), ...(overrides && { overrides }), noValues: !resource(ref.ref)?.valuesIn.includes(env) });
  const connectionKey = (id: string) => {
    for (const c of links.connections) {
      const key = c.link && c.fields.find((f) => f.configurable === id)?.key;
      if (key) return { ref: c.link!, key };
    }
  };

  const target = (id: string): TargetView => {
    if (links.sourceDefined) {
      const d = links.declared?.[id];
      return d ? { source: { ...source(d), declared: true } } : {};
    }
    if (!editable) {
      const ref = release?.configurables[id] ?? release?.env[id];
      return ref ? { source: source(ref) } : {};
    }
    const own = links.fieldLinks[id] ?? links.env[id];
    const via = connectionKey(id);
    const picker: Picker = {
      first: via ? VIA : ENTER,
      selected: own ? `${own.ref}|${own.key}` : via ? VIA : ENTER,
      resources: links.resources.map((r) => ({
        id: r.id,
        name: r.displayName,
        keys: r.keys.map(({ name: key }) => {
          const by = links.used[`${r.id}|${key}`];
          if (by && by !== id) return { key, usedBy: targetName(by) };
          // A write that takes a key from a link the build lost moves it.
          const orphan = links.usedByOrphaned[`${r.id}|${key}`];
          return orphan ? { key, orphanOf: targetName(orphan) } : { key };
        }),
      })),
    };
    const s = own ?? via;
    return { ...(s && { source: source(s, !!own && !!via) }), picker };
  };

  // Outside the first environment, the release's build may name its connections otherwise than the Workload's build.
  const releaseConnections = (): LinkConnection[] =>
    [...new Set([...Object.keys(release?.connections ?? {}), ...links.connections.map((c) => c.id)])].sort().flatMap((id) => {
      const own = connectionFields(fields, id);
      const link = release?.connections[id];
      return own.length ? [{ id, ...(link && { link }), suggestions: [], fields: own.map((configurable) => ({ configurable })) }] : [];
    });

  const sections = editable ? links.connections : releaseConnections();
  if (links.sourceDefined) return { editable, sourceDefined: true, connections: sections.map((c) => ({ connection: c })), target, orphaned: [] };

  const connections = sections.map((c) => {
    const uses = c.link;
    // A connection the Workload's build renamed has no link now to compare with.
    const now = editable ? c : links.connections.find((x) => x.id === c.id);
    const changed = now && now.link !== uses ? ` The link is now ${now.link ? name(now.link) : 'removed'}.` : '';
    // What the section's fields receive in this release, by the connection's link or their own.
    const received = [...new Set([...(uses ? [uses] : []), ...c.fields.flatMap((f) => release?.configurables[f.configurable]?.ref ?? [])])].map(name);
    const note = editable ? undefined : `This release uses ${received.length ? received.join(', ') : 'no resource'}.${changed} Change links in ${envName(first ?? '')}.`;
    return { connection: c, ...(uses && { linked: resource(uses) }), ...(note && { note }) };
  });

  return { editable, sourceDefined: false, connections, target, orphaned: links.orphaned.map((o) => ({ ...o, name: name(o.ref) })) };
}

/** The resources the source environment's release uses that have no values in target: promoting starts it there without them. */
export const promoteWithoutValues = (links: IntegrationLinks, source: string, target: string): string[] =>
  (links.environments.find((e) => e.name === source)?.resources ?? []).flatMap(({ ref }) => {
    const r = links.resources.find((x) => x.id === ref);
    return r?.valuesIn.includes(target) ? [] : [r?.displayName ?? ref];
  });

/** Whether target's release uses what source's does: after a promote, once target runs source's release. */
export const sameLinks = (links: IntegrationLinks, source: string, target: string): boolean => {
  const [s, t] = [source, target].map((name) => links.environments.find((e) => e.name === name));
  const uses = (e?: EnvironmentLinks) => JSON.stringify([e?.resources.map((r) => r.ref), e?.connections, e?.configurables, e?.env]);
  return uses(s) === uses(t);
};

/** A connection's configurables among fields: those named after it (`github` → `githubAuthToken`), as ipaas-service groups them. */
const connectionFields = (fields: string[], connection: string) => fields.filter((f) => f.startsWith(connection) && /^[A-Z]/.test(f.slice(connection.length)));
