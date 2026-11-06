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

import { describe, expect, it } from 'vitest';
import type { EnvGroup, MiConfig, MiConfigSavePlan } from '../types/envGroups';
import { applyMiConfigSavePlan, type EnvGroupWriter, isEmptyMiConfigSavePlan, isMiManagedGroup, MI_ENV_VARS_GROUP, MI_SECRETS_GROUP, miConfigCount, miSecretGroup, planMiConfigSave, toMiConfig, validateMiConfigDraft } from './miConfigs';

const group = (name: string, sensitive: boolean, keys: string[]): EnvGroup => ({ name, sensitive, keys, data: {} });

describe('toMiConfig', () => {
  it('reads env vars from mi-env-vars and secrets from mi-secrets and the old per-secret groups', () => {
    const groups = [group(MI_ENV_VARS_GROUP, false, ['HOST', 'PORT']), group(MI_SECRETS_GROUP, true, ['API_KEY']), group(miSecretGroup('TOKEN'), true, ['TOKEN'])];
    expect(toMiConfig(groups, { HOST: 'example.com', PORT: '8290' })).toEqual({
      envVars: [
        { key: 'HOST', value: 'example.com' },
        { key: 'PORT', value: '8290' },
      ],
      secrets: ['API_KEY', 'TOKEN'],
      legacySecrets: ['TOKEN'],
      shadowedLegacySecrets: [],
      envVarsGroupIsSecret: false,
      secretsGroupIsPlain: false,
      otherGroupKeys: {},
      otherPlainGroupKeys: {},
      otherSecretGroupKeys: {},
    });
  });

  it('flags an mi-env-vars group stored as a secret instead of reading it', () => {
    const groups = [group(MI_ENV_VARS_GROUP, true, ['HOST']), group(MI_SECRETS_GROUP, true, ['TOKEN'])];
    expect(toMiConfig(groups, {})).toMatchObject({ envVars: [], secrets: ['TOKEN'], envVarsGroupIsSecret: true });
  });

  it('flags an mi-secrets group that is not a secret instead of reading it', () => {
    const groups = [group(MI_SECRETS_GROUP, false, ['TOKEN'])];
    expect(toMiConfig(groups, {})).toMatchObject({ secrets: [], secretsGroupIsPlain: true });
  });

  it('treats old per-secret keys as taken when the mi-secrets group is plain', () => {
    // The Secrets section is hidden then, so an env var with such a key must not slip through.
    const groups = [group(MI_SECRETS_GROUP, false, ['PLAIN']), group(miSecretGroup('TOKEN'), true, ['TOKEN'])];
    expect(toMiConfig(groups, {})).toMatchObject({ secrets: ['TOKEN'], legacySecrets: ['TOKEN'], otherGroupKeys: { PLAIN: MI_SECRETS_GROUP, TOKEN: miSecretGroup('TOKEN') } });
  });

  it('reads a key in both mi-secrets and its old group from mi-secrets only', () => {
    const groups = [group(MI_SECRETS_GROUP, true, ['TOKEN']), group(miSecretGroup('TOKEN'), true, ['TOKEN'])];
    expect(toMiConfig(groups, {})).toMatchObject({ secrets: ['TOKEN'], legacySecrets: [], shadowedLegacySecrets: ['TOKEN'] });
  });

  it('reads groups made on the Configs & Secrets page only as keys MI cannot add', () => {
    const groups = [group('db-settings', false, ['DB_URL']), group('db-creds', true, ['DB_PASSWORD'])];
    expect(toMiConfig(groups, {})).toEqual({
      envVars: [],
      secrets: [],
      legacySecrets: [],
      shadowedLegacySecrets: [],
      envVarsGroupIsSecret: false,
      secretsGroupIsPlain: false,
      otherGroupKeys: { DB_URL: 'db-settings', DB_PASSWORD: 'db-creds' },
      otherPlainGroupKeys: { DB_URL: 'db-settings' },
      otherSecretGroupKeys: { DB_PASSWORD: 'db-creds' },
    });
  });

  it('lists the keys of every group MI does not manage, a wrong-kind mi- group included', () => {
    const groups = [group(MI_ENV_VARS_GROUP, true, ['HOST']), group(MI_SECRETS_GROUP, true, ['TOKEN']), group('shared', false, ['TOKEN', 'URL'])];
    const config = toMiConfig(groups, {});
    expect(config.otherGroupKeys).toEqual({ HOST: MI_ENV_VARS_GROUP, TOKEN: 'shared', URL: 'shared' });
    expect(config.otherSecretGroupKeys).toEqual({ HOST: MI_ENV_VARS_GROUP });
    expect(config.otherPlainGroupKeys).toEqual({ TOKEN: 'shared', URL: 'shared' });
  });

  it('ignores secret groups that only look like MI ones', () => {
    // Prefix matches but the name is not miSecretGroup(key): multiple keys, or a key that differs.
    const groups = [group('mi-secret-db', true, ['DB_USER', 'DB_PASS']), group('mi-secret-OTHER', true, ['TOKEN']), group(miSecretGroup('API_KEY'), true, ['API_KEY'])];
    expect(toMiConfig(groups, {}).secrets).toEqual(['API_KEY']);
  });
});

describe('isMiManagedGroup', () => {
  it('is true only for the groups MI Configure reads and writes', () => {
    expect(isMiManagedGroup(group(MI_ENV_VARS_GROUP, false, ['HOST']))).toBe(true);
    expect(isMiManagedGroup(group(MI_SECRETS_GROUP, true, ['TOKEN']))).toBe(true);
    expect(isMiManagedGroup(group(miSecretGroup('TOKEN'), true, ['TOKEN']))).toBe(true);
  });

  it('is false for a mi- group of the wrong kind, a look-alike, or a user group', () => {
    expect(isMiManagedGroup(group(MI_ENV_VARS_GROUP, true, ['HOST']))).toBe(false);
    expect(isMiManagedGroup(group(MI_SECRETS_GROUP, false, ['TOKEN']))).toBe(false);
    expect(isMiManagedGroup(group('mi-secret-db', true, ['DB_USER', 'DB_PASS']))).toBe(false);
    expect(isMiManagedGroup(group('db-creds', true, ['DB_PASSWORD']))).toBe(false);
  });
});

describe('miConfigCount', () => {
  it('counts env vars and secrets', () => {
    expect(
      miConfigCount({ envVars: [{ key: 'A', value: '1' }], secrets: ['B', 'C'], legacySecrets: [], shadowedLegacySecrets: [], envVarsGroupIsSecret: false, secretsGroupIsPlain: false, otherGroupKeys: {}, otherPlainGroupKeys: {}, otherSecretGroupKeys: {} }),
    ).toBe(3);
  });
});

describe('validateMiConfigDraft', () => {
  it('accepts valid keys and a blank value for a stored secret', () => {
    const draft = { envVars: [{ key: 'HOST', value: '' }], secrets: [{ key: 'TOKEN', value: '' }] };
    expect(validateMiConfigDraft(draft, ['TOKEN']).size).toBe(0);
  });

  it('rejects invalid keys', () => {
    const errors = validateMiConfigDraft({ envVars: [{ key: '1BAD', value: 'x' }], secrets: [] }, []);
    expect(errors.has('env:0')).toBe(true);
  });

  it('flags every row of a key used twice, even across env vars and secrets', () => {
    // The env var is the row being typed; the clashing secret is already stored.
    const errors = validateMiConfigDraft({ envVars: [{ key: 'KEY', value: 'x' }], secrets: [{ key: 'KEY', value: '' }] }, ['KEY']);
    expect(errors.get('env:0')).toMatch(/more than once/);
    expect(errors.get('secret:0')).toMatch(/more than once/);
  });

  it('rejects a Ballerina config env var name', () => {
    const errors = validateMiConfigDraft({ envVars: [{ key: 'BAL_CONFIG_FILES', value: 'x' }], secrets: [{ key: 'BAL_CONFIG_VAR_X', value: 's' }] }, []);
    expect(errors.get('env:0')).toMatch(/reserved for Ballerina/);
    expect(errors.get('secret:0')).toMatch(/reserved for Ballerina/);
  });

  it('lets through a reserved Ballerina key that no write sends', () => {
    // Saved before the check. The BFF checks only the keys a write sends.
    const stored = cfg({ envVars: [{ key: 'BAL_CONFIG_FILES', value: 'x' }], secrets: ['BAL_CONFIG_VAR_X'] });
    const unchanged = {
      envVars: [{ key: 'BAL_CONFIG_FILES', value: 'x' }],
      secrets: [
        { key: 'BAL_CONFIG_VAR_X', value: '' },
        { key: 'NEW', value: 'n' },
      ],
    };
    expect(validateMiConfigDraft(unchanged, ['BAL_CONFIG_VAR_X'], stored).size).toBe(0);
  });

  it('rejects a stored reserved Ballerina key once a write sends it', () => {
    const stored = cfg({ envVars: [{ key: 'BAL_CONFIG_FILES', value: 'x' }], secrets: ['BAL_CONFIG_VAR_X'] });
    // Writing mi-env-vars sends every variable; a new secret value is sent too.
    const draft = {
      envVars: [
        { key: 'BAL_CONFIG_FILES', value: 'x' },
        { key: 'HOST', value: 'h' },
      ],
      secrets: [{ key: 'BAL_CONFIG_VAR_X', value: 'rotated' }],
    };
    const errors = validateMiConfigDraft(draft, ['BAL_CONFIG_VAR_X'], stored);
    expect(errors.get('env:0')).toMatch(/reserved for Ballerina/);
    expect(errors.has('env:1')).toBe(false);
    expect(errors.get('secret:0')).toMatch(/reserved for Ballerina/);
  });

  it('rejects a key a config of the other kind also sets, once its MI group is written', () => {
    // Saved before the checks: HOST is also in a secret config, TOKEN in a plain one.
    const stored = cfg({ envVars: [{ key: 'HOST', value: 'h' }], secrets: ['TOKEN'], otherGroupKeys: { HOST: 'creds', TOKEN: 'settings' }, otherSecretGroupKeys: { HOST: 'creds' }, otherPlainGroupKeys: { TOKEN: 'settings' } });
    const unchanged = { envVars: [{ key: 'HOST', value: 'h' }], secrets: [{ key: 'TOKEN', value: '' }] };
    expect(validateMiConfigDraft(unchanged, ['TOKEN'], stored).size).toBe(0);
    // Any change to a group writes all of it, kept secrets included.
    const changed = {
      envVars: [
        { key: 'HOST', value: 'h' },
        { key: 'PORT', value: '1' },
      ],
      secrets: [
        { key: 'TOKEN', value: '' },
        { key: 'NEW', value: 'n' },
      ],
    };
    const errors = validateMiConfigDraft(changed, ['TOKEN'], stored);
    expect(errors.get('env:0')).toBe('"HOST" is also set by the secret "creds" config. Remove it from one of them.');
    expect(errors.get('secret:0')).toBe('"TOKEN" is also set by the non-secret "settings" config. Remove it from one of them.');
    expect(errors.has('env:1')).toBe(false);
    expect(errors.has('secret:1')).toBe(false);
  });

  it('lets through an old per-secret key a plain config also sets while it stays in its old group', () => {
    const stored = cfg({ secrets: ['OLD', 'TOKEN'], legacySecrets: ['OLD'], otherGroupKeys: { OLD: 'settings' }, otherPlainGroupKeys: { OLD: 'settings' } });
    const draft = {
      envVars: [],
      secrets: [
        { key: 'OLD', value: '' },
        { key: 'TOKEN', value: 'rotated' },
      ],
    };
    expect(validateMiConfigDraft(draft, ['OLD', 'TOKEN'], stored).size).toBe(0);
  });

  it('rejects an env var with the key of an old per-secret group while mi-secrets is plain', () => {
    const stored = toMiConfig([group(MI_SECRETS_GROUP, false, ['PLAIN']), group(miSecretGroup('TOKEN'), true, ['TOKEN'])], {});
    // The drawer leaves the hidden secrets out of the draft.
    const errors = validateMiConfigDraft({ envVars: [{ key: 'TOKEN', value: 'x' }], secrets: [] }, ['TOKEN'], stored);
    expect(errors.get('env:0')).toBe(`"TOKEN" is already set by the "${miSecretGroup('TOKEN')}" config.`);
  });

  it('rejects a key another config sets', () => {
    const errors = validateMiConfigDraft({ envVars: [{ key: 'DB_URL', value: 'x' }], secrets: [{ key: 'OK', value: 's' }] }, [], cfg({ otherGroupKeys: { DB_URL: 'db-settings' } }));
    expect(errors.get('env:0')).toBe('"DB_URL" is already set by the "db-settings" config.');
    expect(errors.has('secret:0')).toBe(false);
  });

  it('lets through a shared key the MI group it is written to already has', () => {
    // Saved before the checks: each key is also in a Configs & Secrets group.
    const stored = cfg({ envVars: [{ key: 'HOST', value: 'h' }], secrets: ['TOKEN', 'OLD'], legacySecrets: ['OLD'], otherGroupKeys: { HOST: 'shared', TOKEN: 'shared', OLD: 'shared' } });
    const draft = {
      envVars: [{ key: 'HOST', value: 'changed' }],
      secrets: [
        { key: 'TOKEN', value: 'rotated' },
        { key: 'OLD', value: '' },
      ],
    };
    expect(validateMiConfigDraft(draft, ['TOKEN', 'OLD'], stored).size).toBe(0);
  });

  it('rejects a shared key moving to an MI group that does not have it', () => {
    const stored = cfg({ envVars: [{ key: 'HOST', value: 'h' }], secrets: ['TOKEN', 'OLD'], legacySecrets: ['OLD'], otherGroupKeys: { HOST: 'shared', TOKEN: 'shared', OLD: 'shared' } });
    // HOST becomes a secret, TOKEN a variable, and OLD gets a new value (so it moves to mi-secrets).
    const draft = {
      envVars: [{ key: 'TOKEN', value: 't' }],
      secrets: [
        { key: 'HOST', value: 'h' },
        { key: 'OLD', value: 'new' },
      ],
    };
    const errors = validateMiConfigDraft(draft, ['TOKEN', 'OLD'], stored);
    expect(errors.get('env:0')).toMatch(/already set by the "shared" config/);
    expect(errors.get('secret:0')).toMatch(/already set by the "shared" config/);
    expect(errors.get('secret:1')).toMatch(/already set by the "shared" config/);
  });

  it('requires a value for a new secret', () => {
    const errors = validateMiConfigDraft({ envVars: [], secrets: [{ key: 'TOKEN', value: '' }] }, []);
    expect(errors.get('secret:0')).toMatch(/Enter a value/);
  });
});

// A stored MI configuration; secrets are in mi-secrets unless listed in `legacySecrets`.
const cfg = (c: Partial<MiConfig>): MiConfig => ({ envVars: [], secrets: [], legacySecrets: [], shadowedLegacySecrets: [], envVarsGroupIsSecret: false, secretsGroupIsPlain: false, otherGroupKeys: {}, otherPlainGroupKeys: {}, otherSecretGroupKeys: {}, ...c });
const env = (e: Record<string, string>) => Object.entries(e).map(([key, value]) => ({ key, value }));
// The plan's writes, one line each.
const writesOf = (plan: MiConfigSavePlan): string[] => plan.writes.map((w) => (w.kind === 'delete' ? `delete ${w.group}` : `put ${w.group} ${JSON.stringify(w.data)}${w.keep ? ` keep ${w.keep.join(',')}` : ''}`));

describe('planMiConfigSave', () => {
  const stored = cfg({ envVars: env({ HOST: 'a' }), secrets: ['TOKEN'] });

  it('plans nothing when the draft matches what is stored', () => {
    const plan = planMiConfigSave(stored, { envVars: env({ HOST: 'a' }), secrets: [{ key: 'TOKEN', value: '' }] });
    expect(isEmptyMiConfigSavePlan(plan)).toBe(true);
  });

  it('rewrites the env-var group when a value changes', () => {
    expect(writesOf(planMiConfigSave(stored, { envVars: env({ HOST: 'b' }), secrets: [{ key: 'TOKEN', value: '' }] }))).toEqual(['put mi-env-vars {"HOST":"b"}']);
  });

  it('rewrites the env-var group when a duplicated draft key hides a removed one', () => {
    const plan = planMiConfigSave(cfg({ envVars: env({ HOST: 'a', PORT: '80' }) }), { envVars: [...env({ HOST: 'a' }), ...env({ HOST: 'a' })], secrets: [] });
    expect(writesOf(plan)).toEqual(['put mi-env-vars {"HOST":"a"}']);
  });

  it('deletes the env-var group when every variable is removed', () => {
    expect(writesOf(planMiConfigSave(stored, { envVars: [], secrets: [{ key: 'TOKEN', value: '' }] }))).toEqual(['delete mi-env-vars']);
  });

  it('adds a secret in one write, keeping the unchanged ones', () => {
    const plan = planMiConfigSave(stored, {
      envVars: env({ HOST: 'a' }),
      secrets: [
        { key: 'TOKEN', value: '' },
        { key: 'NEW', value: 's3cret' },
      ],
    });
    expect(writesOf(plan)).toEqual(['put mi-secrets {"NEW":"s3cret"} keep TOKEN']);
  });

  it('replaces a stored secret given a new value', () => {
    expect(writesOf(planMiConfigSave(stored, { envVars: env({ HOST: 'a' }), secrets: [{ key: 'TOKEN', value: 'rotated' }] }))).toEqual(['put mi-secrets {"TOKEN":"rotated"}']);
  });

  it('removes a secret by keeping only the others', () => {
    const plan = planMiConfigSave(cfg({ secrets: ['A', 'B'] }), { envVars: [], secrets: [{ key: 'A', value: '' }] });
    expect(writesOf(plan)).toEqual(['put mi-secrets {} keep A']);
  });

  it('deletes mi-secrets when every secret is removed', () => {
    expect(writesOf(planMiConfigSave(cfg({ secrets: ['A', 'B'] }), { envVars: [], secrets: [] }))).toEqual(['delete mi-secrets']);
  });

  it('leaves an old per-secret group alone while its secret is unchanged', () => {
    const plan = planMiConfigSave(cfg({ secrets: ['OLD'], legacySecrets: ['OLD'] }), { envVars: [], secrets: [{ key: 'OLD', value: '' }] });
    expect(isEmptyMiConfigSavePlan(plan)).toBe(true);
  });

  it('moves an old per-secret secret into mi-secrets once it gets a new value', () => {
    const plan = planMiConfigSave(cfg({ secrets: ['OLD', 'TOKEN'], legacySecrets: ['OLD'] }), {
      envVars: [],
      secrets: [
        { key: 'OLD', value: 'new' },
        { key: 'TOKEN', value: '' },
      ],
    });
    expect(writesOf(plan)).toEqual(['delete mi-secret-OLD', 'put mi-secrets {"OLD":"new"} keep TOKEN']);
  });

  it('deletes the old group of a removed secret', () => {
    expect(writesOf(planMiConfigSave(cfg({ secrets: ['OLD'], legacySecrets: ['OLD'] }), { envVars: [], secrets: [] }))).toEqual(['delete mi-secret-OLD']);
  });

  it('leaves an old group shadowed by mi-secrets alone while the key stays a secret', () => {
    const stored = cfg({ secrets: ['A', 'B'], shadowedLegacySecrets: ['A'] });
    expect(
      writesOf(
        planMiConfigSave(stored, {
          envVars: [],
          secrets: [
            { key: 'A', value: 'new' },
            { key: 'B', value: '' },
          ],
        }),
      ),
    ).toEqual(['put mi-secrets {"A":"new"} keep B']);
  });

  it('deletes an old group shadowed by mi-secrets once the key is removed', () => {
    const stored = cfg({ secrets: ['A', 'B'], shadowedLegacySecrets: ['A'] });
    expect(writesOf(planMiConfigSave(stored, { envVars: [], secrets: [{ key: 'B', value: '' }] }))).toEqual(['put mi-secrets {} keep B', 'delete mi-secret-A']);
  });

  it('deletes an old group shadowed by mi-secrets before the key becomes a variable', () => {
    const stored = cfg({ secrets: ['A', 'B'], shadowedLegacySecrets: ['A'] });
    expect(writesOf(planMiConfigSave(stored, { envVars: [{ key: 'A', value: 'a' }], secrets: [{ key: 'B', value: '' }] }))).toEqual(['put mi-secrets {} keep B', 'delete mi-secret-A', 'put mi-env-vars {"A":"a"}']);
  });

  it('writes mi-secrets before mi-env-vars when a secret becomes a variable', () => {
    // mi-env-vars must set TOKEN after mi-secrets drops it, or the drop would remove it again.
    const plan = planMiConfigSave(stored, { envVars: env({ HOST: 'a', TOKEN: 'plain' }), secrets: [] });
    expect(writesOf(plan)).toEqual(['delete mi-secrets', 'put mi-env-vars {"HOST":"a","TOKEN":"plain"}']);
  });

  it('writes mi-env-vars before mi-secrets when a variable becomes a secret', () => {
    const plan = planMiConfigSave(cfg({ envVars: env({ HOST: 'a', PORT: '80' }) }), { envVars: env({ HOST: 'a' }), secrets: [{ key: 'PORT', value: '80' }] });
    expect(writesOf(plan)).toEqual(['put mi-env-vars {"HOST":"a"}', 'put mi-secrets {"PORT":"80"}']);
  });

  it('writes mi-secrets twice when keys move both ways in one save', () => {
    // TOKEN becomes a variable and HOST a secret; KEEP stays a secret throughout.
    const plan = planMiConfigSave(cfg({ envVars: env({ HOST: 'a' }), secrets: ['KEEP', 'TOKEN'] }), {
      envVars: env({ TOKEN: 'plain' }),
      secrets: [
        { key: 'KEEP', value: '' },
        { key: 'HOST', value: 'h' },
      ],
    });
    expect(writesOf(plan)).toEqual(['put mi-secrets {} keep KEEP', 'put mi-env-vars {"TOKEN":"plain"}', 'put mi-secrets {"HOST":"h"} keep KEEP']);
  });

  it('never writes an mi-env-vars group stored as a secret', () => {
    const plan = planMiConfigSave(cfg({ secrets: ['TOKEN'], envVarsGroupIsSecret: true }), { envVars: env({ HOST: 'a' }), secrets: [{ key: 'TOKEN', value: 'rotated' }] });
    expect(writesOf(plan)).toEqual(['put mi-secrets {"TOKEN":"rotated"}']);
  });

  it('never writes secrets while mi-secrets is not a secret group', () => {
    const plan = planMiConfigSave(cfg({ secretsGroupIsPlain: true }), { envVars: env({ HOST: 'a' }), secrets: [{ key: 'NEW', value: 's' }] });
    expect(writesOf(plan)).toEqual(['put mi-env-vars {"HOST":"a"}']);
  });
});

describe('applyMiConfigSavePlan', () => {
  // Records each write in order; `failOn` makes the write to that group throw.
  const recorder = (failOn?: string) => {
    const calls: string[] = [];
    const writer: EnvGroupWriter = {
      put: async (name, sensitive, data, keep) => {
        if (name === failOn) throw new Error(`Cannot write ${name}.`);
        calls.push(`put ${name} ${sensitive ? 'secret' : 'plain'} ${JSON.stringify(data)}${keep ? ` keep ${keep.join(',')}` : ''}`);
      },
      remove: async (name) => {
        if (name === failOn) throw new Error(`Cannot delete ${name}.`);
        calls.push(`delete ${name}`);
      },
    };
    return { calls, writer };
  };

  it('applies the writes in order, passing keep through', async () => {
    const { calls, writer } = recorder();
    await applyMiConfigSavePlan(
      {
        writes: [
          { kind: 'delete', group: miSecretGroup('OLD') },
          { kind: 'put', group: MI_ENV_VARS_GROUP, sensitive: false, data: { A: '1' } },
          { kind: 'put', group: MI_SECRETS_GROUP, sensitive: true, data: { S: 'v' }, keep: ['T'] },
        ],
      },
      writer,
    );
    expect(calls).toEqual([`delete ${miSecretGroup('OLD')}`, `put ${MI_ENV_VARS_GROUP} plain {"A":"1"}`, `put ${MI_SECRETS_GROUP} secret {"S":"v"} keep T`]);
  });

  it('passes the error through unchanged when the first write fails', async () => {
    const { calls, writer } = recorder(miSecretGroup('OLD'));
    await expect(applyMiConfigSavePlan({ writes: [{ kind: 'delete', group: miSecretGroup('OLD') }] }, writer)).rejects.toThrow(/^Cannot delete mi-secret-OLD\.$/);
    expect(calls).toEqual([]);
  });

  it('says some changes were saved when a later write fails, and stops there', async () => {
    const { calls, writer } = recorder(MI_ENV_VARS_GROUP);
    const plan: MiConfigSavePlan = {
      writes: [
        { kind: 'delete', group: miSecretGroup('OLD') },
        { kind: 'put', group: MI_ENV_VARS_GROUP, sensitive: false, data: { A: '1' } },
        { kind: 'put', group: MI_SECRETS_GROUP, sensitive: true, data: { S: 'v' } },
      ],
    };
    await expect(applyMiConfigSavePlan(plan, writer)).rejects.toThrow('Cannot write mi-env-vars. Some changes were saved before this failed. Save again to apply the rest.');
    expect(calls).toEqual([`delete ${miSecretGroup('OLD')}`]);
  });
});
