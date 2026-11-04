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

import type { EnvGroup, MiConfig, MiConfigDraft, MiConfigSavePlan, MiConfigWrite } from '../types/envGroups';
import { isBallerinaConfigKey, keyInOtherGroupError, validateConfigKey } from './devopsConfigs';

/**
 * MI reads `${configs.x}` from environment variables, so its configuration is a
 * free-form list of variables and secrets per environment (devant's
 * MiConfigurationSelector), stored as two env-var groups:
 *   - `mi-env-vars`: the plain variables, like devant's single ENV map;
 *   - `mi-secrets`: the secrets. Their values can't be read back, so a save sends
 *     only new values and names the unchanged ones in `keep`.
 * Secrets saved before `mi-secrets` existed are in a group each (`mi-secret-<KEY>`);
 * see `MiConfig.legacySecrets`. Groups made on the Configs & Secrets page are left alone.
 */
export const MI_ENV_VARS_GROUP = 'mi-env-vars';
export const MI_SECRETS_GROUP = 'mi-secrets';
const MI_SECRET_GROUP_PREFIX = 'mi-secret-';

export const miSecretGroup = (key: string): string => `${MI_SECRET_GROUP_PREFIX}${key}`;

/** A per-secret group as `miSecretGroup` names it. A look-alike (e.g. `mi-secret-db` with two keys) is not one. */
const isLegacySecretGroup = (g: EnvGroup): boolean => g.sensitive && g.keys.length === 1 && g.name === miSecretGroup(g.keys[0]);

/**
 * Whether MI Configure manages this group, so Configs & Secrets should not edit it.
 * A `mi-*` group of the wrong kind (e.g. a secret `mi-env-vars`) is not managed:
 * MI Configure leaves it alone, and Configs & Secrets is where it can be fixed.
 */
export function isMiManagedGroup(g: Pick<EnvGroup, 'name' | 'sensitive' | 'keys'>): boolean {
  if (g.name === MI_ENV_VARS_GROUP) return !g.sensitive;
  if (g.name === MI_SECRETS_GROUP) return g.sensitive;
  return isLegacySecretGroup({ ...g, data: {} });
}

/** The MI configuration held in an environment's groups. `envVarValues` is the env-var group's data. */
export function toMiConfig(groups: EnvGroup[], envVarValues: Record<string, string>): MiConfig {
  const envGroup = groups.find((g) => g.name === MI_ENV_VARS_GROUP && !g.sensitive);
  const envVars = (envGroup?.keys ?? []).map((key) => ({ key, value: envVarValues[key] ?? '' }));
  const secretsGroup = groups.find((g) => g.name === MI_SECRETS_GROUP && g.sensitive);
  const grouped = new Set(secretsGroup?.keys ?? []);
  // A key in both places is read from `mi-secrets`. Its old group is left alone while the
  // key stays there: deleting it would also drop the key from the container env.
  const legacyKeys = groups.filter(isLegacySecretGroup).map((g) => g.keys[0]);
  const legacySecrets = legacyKeys.filter((key) => !grouped.has(key)).sort();
  const shadowedLegacySecrets = legacyKeys.filter((key) => grouped.has(key)).sort();
  const secrets = [...grouped, ...legacySecrets].sort();
  const otherGroupKeys: Record<string, string> = {};
  const otherPlainGroupKeys: Record<string, string> = {};
  const otherSecretGroupKeys: Record<string, string> = {};
  // Each key maps to the first group by name that sets it.
  const take = (key: string, group: string, sensitive: boolean) => {
    if (!(key in otherGroupKeys)) otherGroupKeys[key] = group;
    const byKind = sensitive ? otherSecretGroupKeys : otherPlainGroupKeys;
    if (!(key in byKind)) byKind[key] = group;
  };
  groups
    .filter((g) => !isMiManagedGroup(g))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((g) => g.keys.forEach((key) => take(key, g.name, g.sensitive)));
  const secretsGroupIsPlain = groups.some((g) => g.name === MI_SECRETS_GROUP && !g.sensitive);
  // With `mi-secrets` left alone, its Secrets section is hidden, so the old per-secret
  // groups can't be edited here either: their keys are taken, like another group's.
  if (secretsGroupIsPlain) legacySecrets.forEach((key) => take(key, miSecretGroup(key), true));
  return {
    envVars,
    secrets,
    legacySecrets,
    shadowedLegacySecrets,
    envVarsGroupIsSecret: groups.some((g) => g.name === MI_ENV_VARS_GROUP && g.sensitive),
    secretsGroupIsPlain,
    otherGroupKeys,
    otherPlainGroupKeys,
    otherSecretGroupKeys,
  };
}

/** Number of variables plus secrets — the deploy card's "Configurables" count. */
export const miConfigCount = (config: MiConfig): number => config.envVars.length + config.secrets.length;

/** The error for a key that a group of the other kind also sets, or ''. */
const kindClashError = (key: string, groups: ReadonlyMap<string, string>, otherKind: 'secret' | 'plain'): string => {
  const group = groups.get(key);
  return group === undefined ? '' : `"${key}" is also set by the ${otherKind === 'secret' ? 'secret' : 'non-secret'} "${group}" config. Remove it from one of them.`;
};

/**
 * Validates a draft. Returns an error per row key (`env:<i>` / `secret:<i>`);
 * an empty map means the draft can be saved. `storedSecrets` are the secrets
 * that already exist, whose value may stay blank (unchanged). `stored` is the
 * configuration the draft was made from. The checks follow the BFF's, for the
 * writes `planMiConfigSave` makes:
 *   - a reserved Ballerina key is rejected when it is sent. Every write of
 *     `mi-env-vars` sends all its variables; a stored secret left blank is kept, not sent;
 *   - a key another env-var group sets (`MiConfig.otherGroupKeys`) is rejected unless
 *     the MI group it is written to already has it;
 *   - a key in an MI group that is written is rejected while a group of the other kind
 *     (plain or secret) also sets it, even one the MI group already has.
 */
export function validateMiConfigDraft(draft: MiConfigDraft, storedSecrets: string[], stored?: Pick<MiConfig, 'envVars' | 'secrets' | 'legacySecrets' | 'otherGroupKeys' | 'otherPlainGroupKeys' | 'otherSecretGroupKeys'>): Map<string, string> {
  const errors = new Map<string, string>();
  const otherGroupKeys = new Map(Object.entries(stored?.otherGroupKeys ?? {}));
  const otherPlain = new Map(Object.entries(stored?.otherPlainGroupKeys ?? {}));
  const otherSecret = new Map(Object.entries(stored?.otherSecretGroupKeys ?? {}));
  const storedEnvVars = new Map(stored?.envVars.map((e) => [e.key, e.value]));
  const legacy = new Set(stored?.legacySecrets);
  const inSecretsGroup = new Set(stored?.secrets.filter((key) => !legacy.has(key)));
  // Whether each MI group is written, as planMiConfigSave decides. Without `stored`, assume it is.
  const draftEnvVars = new Map(draft.envVars.map((e) => [e.key, e.value]));
  const envVarsWritten = !stored || draftEnvVars.size !== storedEnvVars.size || [...draftEnvVars].some(([key, value]) => storedEnvVars.get(key) !== value);
  const draftSecretKeys = new Set(draft.secrets.map((s) => s.key));
  const secretsWritten = !stored || draft.secrets.some((s) => s.value !== '') || [...inSecretsGroup].some((key) => !draftSecretKeys.has(key));
  // Every row of a duplicated key is flagged, not just the later one: the row the user
  // is typing in may be the earlier one (an env var clashing with a stored secret).
  const uses = new Map<string, number>();
  [...draft.envVars, ...draft.secrets].forEach(({ key }) => uses.set(key, (uses.get(key) ?? 0) + 1));
  // `sent`: the write sends the key's value. `newToGroup`: the group it is written to
  // doesn't have it yet. `groupWritten`: that group is written at all.
  const check = (id: string, key: string, sent: boolean, newToGroup: boolean, groupWritten: boolean, clashKind: 'secret' | 'plain') => {
    const formatErr = isBallerinaConfigKey(key) && !sent ? '' : validateConfigKey(key);
    const keyErr = formatErr || (newToGroup ? keyInOtherGroupError(key, otherGroupKeys) : '') || (groupWritten ? kindClashError(key, clashKind === 'secret' ? otherSecret : otherPlain, clashKind) : '');
    if (keyErr) errors.set(id, keyErr);
    else if ((uses.get(key) ?? 0) > 1) errors.set(id, `'${key}' is defined more than once.`);
  };
  draft.envVars.forEach((e, i) => check(`env:${i}`, e.key, envVarsWritten, !storedEnvVars.has(e.key), envVarsWritten, 'secret'));
  draft.secrets.forEach((s, i) => {
    // A stored secret left blank in its old group is not written at all.
    const keptInOldGroup = legacy.has(s.key) && s.value === '' && storedSecrets.includes(s.key);
    check(`secret:${i}`, s.key, s.value !== '', !inSecretsGroup.has(s.key) && !keptInOldGroup, secretsWritten && !keptInOldGroup, 'plain');
    if (!errors.has(`secret:${i}`) && s.value === '' && !storedSecrets.includes(s.key)) errors.set(`secret:${i}`, 'Enter a value for the new secret.');
  });
  return errors;
}

/**
 * The writes, in order, that take `stored` to `draft`.
 *
 * A key moving between groups must leave its old group before its new group sets it.
 * The BFF rejects a key another group lists; without that check (before devant#2821),
 * writing a group dropped the keys it no longer has from the container env, whichever
 * group set them. So:
 *   - old per-secret groups are deleted first;
 *   - a secret becoming a variable: `mi-secrets` is written before `mi-env-vars`;
 *   - a variable becoming a secret: `mi-env-vars` is written before `mi-secrets`;
 *   - both in one save: `mi-secrets` is written twice, without the incoming
 *     secrets first and with them after `mi-env-vars`.
 */
export function planMiConfigSave(stored: MiConfig, draft: MiConfigDraft): MiConfigSavePlan {
  const writes: MiConfigWrite[] = [];

  // Env vars. Compared as maps: a length check plus membership counts a duplicated draft key twice.
  // A secret `mi-env-vars` group is never written: a PUT would replace its stored
  // secrets with the draft's variables, and a delete would drop them.
  const storedEnvVars = new Map(stored.envVars.map((e) => [e.key, e.value]));
  const draftEnvVars = new Map(draft.envVars.map((e) => [e.key, e.value]));
  const sameEnvVars = storedEnvVars.size === draftEnvVars.size && [...draftEnvVars].every(([key, value]) => storedEnvVars.get(key) === value);
  let envWrite: MiConfigWrite | undefined;
  if (!sameEnvVars && !stored.envVarsGroupIsSecret) {
    envWrite = draftEnvVars.size ? { kind: 'put', group: MI_ENV_VARS_GROUP, sensitive: false, data: Object.fromEntries(draftEnvVars) } : { kind: 'delete', group: MI_ENV_VARS_GROUP };
  }

  // Secrets. A plain `mi-secrets` group is left alone, like a secret `mi-env-vars` one.
  if (stored.secretsGroupIsPlain) return { writes: envWrite ? [envWrite] : [] };
  const legacy = new Set(stored.legacySecrets);
  const grouped = stored.secrets.filter((key) => !legacy.has(key));
  const groupedSet = new Set(grouped);
  // A blank value keeps a stored secret where it is; a typed value (or a renamed key) is a new value.
  const keptInPlace = new Set(draft.secrets.filter((s) => s.value === '' && (groupedSet.has(s.key) || legacy.has(s.key))).map((s) => s.key));
  const data: Record<string, string> = Object.fromEntries(draft.secrets.filter((s) => s.value !== '').map((s) => [s.key, s.value]));
  const keep = grouped.filter((key) => keptInPlace.has(key));
  const finalKeys = new Set([...Object.keys(data), ...keep]);

  // Old per-secret groups go unless kept unchanged: a removed secret, or one moving to `mi-secrets`.
  for (const key of stored.legacySecrets) {
    if (!keptInPlace.has(key)) writes.push({ kind: 'delete', group: miSecretGroup(key) });
  }

  const putSecrets = (d: Record<string, string>, k: string[]): MiConfigWrite | undefined =>
    Object.keys(d).length || k.length ? { kind: 'put', group: MI_SECRETS_GROUP, sensitive: true, data: d, ...(k.length ? { keep: k } : {}) } : grouped.length ? { kind: 'delete', group: MI_SECRETS_GROUP } : undefined;
  const secretsChanged = Object.keys(data).length > 0 || grouped.some((key) => !finalKeys.has(key));
  const secretsWrite = secretsChanged ? putSecrets(data, keep) : undefined;

  // An old group still holding a key that leaves `mi-secrets` goes right after the
  // `mi-secrets` write that drops it: before `mi-env-vars` can take the key, which the
  // BFF rejects while another group lists it.
  const shadowDeletes: MiConfigWrite[] = stored.shadowedLegacySecrets.filter((key) => !finalKeys.has(key)).map((key) => ({ kind: 'delete', group: miSecretGroup(key) }));

  const toEnvVars = grouped.some((key) => !finalKeys.has(key) && draftEnvVars.has(key));
  const incoming = Object.keys(data).filter((key) => storedEnvVars.has(key));
  // `envWrite` and `secretsWrite` are always set when keys move (narrowed here for the types).
  if (toEnvVars && incoming.length && envWrite && secretsWrite) {
    // Both directions: drop the outgoing secrets first, add the incoming ones last.
    const rest = Object.fromEntries(Object.entries(data).filter(([key]) => !incoming.includes(key)));
    const first = putSecrets(rest, keep);
    if (first) writes.push(first);
    writes.push(...shadowDeletes, envWrite);
    const kept = [...keep, ...Object.keys(rest)];
    writes.push({ kind: 'put', group: MI_SECRETS_GROUP, sensitive: true, data: Object.fromEntries(incoming.map((key) => [key, data[key]])), ...(kept.length ? { keep: kept } : {}) });
  } else if (toEnvVars) {
    if (secretsWrite) writes.push(secretsWrite);
    writes.push(...shadowDeletes);
    if (envWrite) writes.push(envWrite);
  } else {
    if (envWrite) writes.push(envWrite);
    if (secretsWrite) writes.push(secretsWrite);
    writes.push(...shadowDeletes);
  }
  return { writes };
}

export const isEmptyMiConfigSavePlan = (plan: MiConfigSavePlan): boolean => plan.writes.length === 0;

/** The two env-group writes a save plan needs; `useSaveMiConfig` binds them to the BFF. */
export interface EnvGroupWriter {
  put: (name: string, sensitive: boolean, data: Record<string, string>, keep?: string[]) => Promise<void>;
  remove: (name: string) => Promise<void>;
}

/**
 * Applies a save plan one write at a time, in order: each is a read-modify-write of
 * the same ReleaseBinding annotation in the BFF, so parallel writes would race, and
 * `planMiConfigSave` orders them so a key moving between groups is not dropped.
 *
 * The writes are not atomic. If one fails after others went through, the error says
 * so: those changes are stored, and saving the same draft again applies the rest.
 */
export async function applyMiConfigSavePlan(plan: MiConfigSavePlan, writer: EnvGroupWriter): Promise<void> {
  let applied = 0;
  for (const write of plan.writes) {
    try {
      if (write.kind === 'put') await writer.put(write.group, write.sensitive, write.data, write.keep);
      else await writer.remove(write.group);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Failed to save the configurations.';
      if (applied === 0) throw err instanceof Error ? err : new Error(reason);
      throw new Error(`${reason} Some changes were saved before this failed. Save again to apply the rest.`, { cause: err });
    }
    applied++;
  }
}
