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

import type { IntegrationLinks, KeyRef, LinkableResource, LinkConnection, OrphanedLink } from '../types/configuration';

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
}

export interface Picker {
  first: typeof VIA | typeof ENTER;
  /** `first`, or `<resource>|<KEY>`. */
  selected: string;
  resources: { id: string; name: string; keys: { key: string; usedBy?: string }[] }[];
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
  connections: ConnectionView[];
  /** By configurable id, or env var name for MI. */
  target: (target: string) => TargetView;
  orphaned: (OrphanedLink & { name: string })[];
}

/** The links of a Configure form in env: editable in the first environment, else what env's release uses, read-only. */
export function formLinkView(links: IntegrationLinks, env: string, envName: (env: string) => string = (e) => e): FormLinkView {
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
          return { key, ...(by && by !== id && { usedBy: targetName(by) }) };
        }),
      })),
    };
    const s = own ?? via;
    return { ...(s && { source: source(s, !!own && !!via) }), picker };
  };

  const connections = links.connections.map((c) => {
    const uses = editable ? c.link : release?.connections[c.id];
    const changed = c.link !== uses ? ` The link is now ${c.link ? name(c.link) : 'removed'}.` : '';
    const note = editable ? undefined : `This release uses ${uses ? name(uses) : 'no resource'}.${changed} Change links in ${envName(first ?? '')}.`;
    return { connection: c, ...(uses && { linked: resource(uses) }), ...(note && { note }) };
  });

  return { editable, connections, target, orphaned: links.orphaned.map((o) => ({ ...o, name: name(o.ref) })) };
}
