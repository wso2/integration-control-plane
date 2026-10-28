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
import type { EnvGroup, MiConfig } from '../types/envGroups';
import { applyMiConfigSavePlan, type EnvGroupWriter, isEmptyMiConfigSavePlan, MI_ENV_VARS_GROUP, miConfigCount, miSecretGroup, planMiConfigSave, toMiConfig, validateMiConfigDraft } from './miConfigs';

const group = (name: string, sensitive: boolean, keys: string[]): EnvGroup => ({ name, sensitive, keys, data: {} });

describe('toMiConfig', () => {
  it('reads env vars from the MI group and secrets from the per-secret groups', () => {
    const groups = [group(MI_ENV_VARS_GROUP, false, ['HOST', 'PORT']), group(miSecretGroup('TOKEN'), true, ['TOKEN']), group(miSecretGroup('API_KEY'), true, ['API_KEY'])];
    expect(toMiConfig(groups, { HOST: 'example.com', PORT: '8290' })).toEqual({
      envVars: [
        { key: 'HOST', value: 'example.com' },
        { key: 'PORT', value: '8290' },
      ],
      secrets: ['API_KEY', 'TOKEN'],
    });
  });

  it('ignores groups made on the Configs & Secrets page', () => {
    const groups = [group('db-settings', false, ['DB_URL']), group('db-creds', true, ['DB_PASSWORD'])];
    expect(toMiConfig(groups, {})).toEqual({ envVars: [], secrets: [] });
  });

  it('ignores secret groups that only look like MI ones', () => {
    // Prefix matches but the name is not miSecretGroup(key): multiple keys, or a key that differs.
    const groups = [group('mi-secret-db', true, ['DB_USER', 'DB_PASS']), group('mi-secret-OTHER', true, ['TOKEN']), group(miSecretGroup('API_KEY'), true, ['API_KEY'])];
    expect(toMiConfig(groups, {}).secrets).toEqual(['API_KEY']);
  });
});

describe('miConfigCount', () => {
  it('counts env vars and secrets', () => {
    expect(miConfigCount({ envVars: [{ key: 'A', value: '1' }], secrets: ['B', 'C'] })).toBe(3);
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

  it('requires a value for a new secret', () => {
    const errors = validateMiConfigDraft({ envVars: [], secrets: [{ key: 'TOKEN', value: '' }] }, []);
    expect(errors.get('secret:0')).toMatch(/Enter a value/);
  });
});

describe('planMiConfigSave', () => {
  const stored: MiConfig = { envVars: [{ key: 'HOST', value: 'a' }], secrets: ['TOKEN'] };

  it('plans nothing when the draft matches what is stored', () => {
    const plan = planMiConfigSave(stored, { envVars: [{ key: 'HOST', value: 'a' }], secrets: [{ key: 'TOKEN', value: '' }] });
    expect(isEmptyMiConfigSavePlan(plan)).toBe(true);
  });

  it('rewrites the env-var group when a value changes', () => {
    const plan = planMiConfigSave(stored, { envVars: [{ key: 'HOST', value: 'b' }], secrets: [{ key: 'TOKEN', value: '' }] });
    expect(plan.envVars).toEqual({ HOST: 'b' });
    expect(plan.secretsToPut).toEqual([]);
  });

  it('rewrites the env-var group when a duplicated draft key hides a removed one', () => {
    const plan = planMiConfigSave(
      { envVars: [{ key: 'HOST', value: 'a' }, { key: 'PORT', value: '80' }], secrets: [] },
      { envVars: [{ key: 'HOST', value: 'a' }, { key: 'HOST', value: 'a' }], secrets: [] },
    );
    expect(plan.envVars).toEqual({ HOST: 'a' });
  });

  it('deletes the env-var group when every variable is removed', () => {
    const plan = planMiConfigSave(stored, { envVars: [], secrets: [{ key: 'TOKEN', value: '' }] });
    expect(plan.envVars).toBeNull();
  });

  it('writes only secrets with a value and deletes removed ones', () => {
    const plan = planMiConfigSave(
      { envVars: [], secrets: ['TOKEN', 'OLD'] },
      {
        envVars: [],
        secrets: [
          { key: 'TOKEN', value: '' },
          { key: 'NEW', value: 's3cret' },
        ],
      },
    );
    expect(plan.envVars).toBeUndefined();
    expect(plan.secretsToPut).toEqual([{ key: 'NEW', value: 's3cret' }]);
    expect(plan.secretsToDelete).toEqual(['OLD']);
  });

  it('replaces a stored secret given a new value', () => {
    const plan = planMiConfigSave(stored, { envVars: [{ key: 'HOST', value: 'a' }], secrets: [{ key: 'TOKEN', value: 'rotated' }] });
    expect(plan.secretsToPut).toEqual([{ key: 'TOKEN', value: 'rotated' }]);
    expect(plan.secretsToDelete).toEqual([]);
  });
});

describe('applyMiConfigSavePlan', () => {
  // Records each write in order; `failOn` makes the write to that group throw.
  const recorder = (failOn?: string) => {
    const calls: string[] = [];
    const writer: EnvGroupWriter = {
      put: async (name, sensitive, data) => {
        if (name === failOn) throw new Error(`Cannot write ${name}.`);
        calls.push(`put ${name} ${sensitive ? 'secret' : 'plain'} ${JSON.stringify(data)}`);
      },
      remove: async (name) => {
        if (name === failOn) throw new Error(`Cannot delete ${name}.`);
        calls.push(`delete ${name}`);
      },
    };
    return { calls, writer };
  };

  it('removes secrets before writing env vars, then writes secrets', async () => {
    // TOKEN moves from a secret to an env var: its secret group must go before the env-var group sets it.
    const { calls, writer } = recorder();
    await applyMiConfigSavePlan({ envVars: { TOKEN: 'plain' }, secretsToPut: [{ key: 'NEW', value: 's' }], secretsToDelete: ['TOKEN'] }, writer);
    expect(calls).toEqual([`delete ${miSecretGroup('TOKEN')}`, `put ${MI_ENV_VARS_GROUP} plain {"TOKEN":"plain"}`, `put ${miSecretGroup('NEW')} secret {"NEW":"s"}`]);
  });

  it('deletes the env-var group for a null plan and leaves it alone for undefined', async () => {
    const removed = recorder();
    await applyMiConfigSavePlan({ envVars: null, secretsToPut: [], secretsToDelete: [] }, removed.writer);
    expect(removed.calls).toEqual([`delete ${MI_ENV_VARS_GROUP}`]);

    const untouched = recorder();
    await applyMiConfigSavePlan({ envVars: undefined, secretsToPut: [], secretsToDelete: [] }, untouched.writer);
    expect(untouched.calls).toEqual([]);
  });

  it('passes the error through unchanged when the first write fails', async () => {
    const { calls, writer } = recorder(miSecretGroup('OLD'));
    await expect(applyMiConfigSavePlan({ envVars: { A: '1' }, secretsToPut: [], secretsToDelete: ['OLD'] }, writer)).rejects.toThrow(/^Cannot delete mi-secret-OLD\.$/);
    expect(calls).toEqual([]);
  });

  it('says some changes were saved when a later write fails, and stops there', async () => {
    const { calls, writer } = recorder(MI_ENV_VARS_GROUP);
    await expect(applyMiConfigSavePlan({ envVars: { A: '1' }, secretsToPut: [{ key: 'S', value: 'v' }], secretsToDelete: ['OLD'] }, writer)).rejects.toThrow('Cannot write mi-env-vars. Some changes were saved before this failed. Save again to apply the rest.');
    expect(calls).toEqual([`delete ${miSecretGroup('OLD')}`]);
  });
});
