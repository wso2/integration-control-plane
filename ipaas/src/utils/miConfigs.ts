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

import type { EnvGroup, MiConfig, MiConfigDraft, MiConfigSavePlan } from '../types/envGroups';
import { validateConfigKey } from './devopsConfigs';

/**
 * MI reads `${configs.x}` from environment variables, so its configuration is a
 * free-form list of variables and secrets per environment (devant's
 * MiConfigurationSelector), stored as env-var groups:
 *   - all plain variables in one group, like devant's single ENV map;
 *   - each secret in a group of its own. Secret values cannot be read back and a
 *     group PUT replaces the whole group, so per-secret groups let an unchanged
 *     secret keep its value. Devant also stores each secret separately.
 * Groups made on the Configs & Secrets page are left alone.
 */
export const MI_ENV_VARS_GROUP = 'mi-env-vars';
const MI_SECRET_GROUP_PREFIX = 'mi-secret-';

export const miSecretGroup = (key: string): string => `${MI_SECRET_GROUP_PREFIX}${key}`;

/** The MI configuration held in an environment's groups. `envVarValues` is the env-var group's data. */
export function toMiConfig(groups: EnvGroup[], envVarValues: Record<string, string>): MiConfig {
  const envGroup = groups.find((g) => g.name === MI_ENV_VARS_GROUP && !g.sensitive);
  const envVars = (envGroup?.keys ?? []).map((key) => ({ key, value: envVarValues[key] ?? '' }));
  const secrets = groups
    // Only groups named exactly as miSecretGroup names them: writes and deletes address
    // a secret by that name, so a look-alike group (e.g. `mi-secret-db` with two keys)
    // is left to the Configs & Secrets page.
    .filter((g) => g.sensitive && g.keys.length === 1 && g.name === miSecretGroup(g.keys[0]))
    .flatMap((g) => g.keys)
    .sort();
  return { envVars, secrets };
}

/** Number of variables plus secrets — the deploy card's "Configurables" count. */
export const miConfigCount = (config: MiConfig): number => config.envVars.length + config.secrets.length;

/**
 * Validates a draft. Returns an error per row key (`env:<i>` / `secret:<i>`);
 * an empty map means the draft can be saved. `storedSecrets` are the secrets
 * that already exist, whose value may stay blank (unchanged).
 */
export function validateMiConfigDraft(draft: MiConfigDraft, storedSecrets: string[]): Map<string, string> {
  const errors = new Map<string, string>();
  // Every row of a duplicated key is flagged, not just the later one: the row the user
  // is typing in may be the earlier one (an env var clashing with a stored secret).
  const uses = new Map<string, number>();
  [...draft.envVars, ...draft.secrets].forEach(({ key }) => uses.set(key, (uses.get(key) ?? 0) + 1));
  const check = (id: string, key: string) => {
    const keyErr = validateConfigKey(key);
    if (keyErr) errors.set(id, keyErr);
    else if ((uses.get(key) ?? 0) > 1) errors.set(id, `'${key}' is defined more than once.`);
  };
  draft.envVars.forEach((e, i) => check(`env:${i}`, e.key));
  draft.secrets.forEach((s, i) => {
    check(`secret:${i}`, s.key);
    if (!errors.has(`secret:${i}`) && s.value === '' && !storedSecrets.includes(s.key)) errors.set(`secret:${i}`, 'Enter a value for the new secret.');
  });
  return errors;
}

/** The writes that take `stored` to `draft`. */
export function planMiConfigSave(stored: MiConfig, draft: MiConfigDraft): MiConfigSavePlan {
  // Compared as maps: a length check plus membership counts a duplicated draft key twice.
  const storedEnvVars = new Map(stored.envVars.map((e) => [e.key, e.value]));
  const draftEnvVars = new Map(draft.envVars.map((e) => [e.key, e.value]));
  const sameEnvVars = storedEnvVars.size === draftEnvVars.size && [...draftEnvVars].every(([key, value]) => storedEnvVars.get(key) === value);
  let envVars: MiConfigSavePlan['envVars'];
  if (!sameEnvVars) envVars = draftEnvVars.size ? Object.fromEntries(draftEnvVars) : null;

  const draftKeys = new Set(draft.secrets.map((s) => s.key));
  // A blank value keeps a stored secret; a renamed key is a new secret.
  const secretsToPut = draft.secrets.filter((s) => s.value !== '');
  const secretsToDelete = stored.secrets.filter((key) => !draftKeys.has(key));
  return { envVars, secretsToPut, secretsToDelete };
}

export const isEmptyMiConfigSavePlan = (plan: MiConfigSavePlan): boolean => plan.envVars === undefined && plan.secretsToPut.length === 0 && plan.secretsToDelete.length === 0;

/** The two env-group writes a save plan needs; `useSaveMiConfig` binds them to the BFF. */
export interface EnvGroupWriter {
  put: (name: string, sensitive: boolean, data: Record<string, string>) => Promise<void>;
  remove: (name: string) => Promise<void>;
}

/**
 * Applies a save plan one write at a time: each is a read-modify-write of the same
 * ReleaseBinding annotation in the BFF, so parallel writes would race. Removals go
 * first: deleting a group also drops its keys from the container env, so a key moved
 * between groups (a secret turned into an env var, or back) must leave its old group
 * before its new one sets it.
 *
 * The writes are not atomic. If one fails after others went through, the error says
 * so: those changes are stored, and saving the same draft again applies the rest.
 */
export async function applyMiConfigSavePlan(plan: MiConfigSavePlan, writer: EnvGroupWriter): Promise<void> {
  const { envVars } = plan;
  const writes: (() => Promise<void>)[] = [
    ...plan.secretsToDelete.map((key) => () => writer.remove(miSecretGroup(key))),
    ...(envVars === null ? [() => writer.remove(MI_ENV_VARS_GROUP)] : envVars ? [() => writer.put(MI_ENV_VARS_GROUP, false, envVars)] : []),
    ...plan.secretsToPut.map((s) => () => writer.put(miSecretGroup(s.key), true, { [s.key]: s.value })),
  ];
  let applied = 0;
  for (const write of writes) {
    try {
      await write();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Failed to save the configurations.';
      if (applied === 0) throw err instanceof Error ? err : new Error(reason);
      throw new Error(`${reason} Some changes were saved before this failed. Save again to apply the rest.`, { cause: err });
    }
    applied++;
  }
}
