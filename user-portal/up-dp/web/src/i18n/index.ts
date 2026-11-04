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

import en from './locales/en';

/*
 * Reads the English strings with the subset of i18next's `t()` the SPA uses: `{{name}}` values,
 * `_one`/`_other` plurals by `count`, and `returnObjects`. It stands in for i18next until that
 * library clears security review; the call sites and the JSON keep i18next's shape, so putting
 * it back changes only this file.
 */

type Strings = typeof en;

/** Every dotted path to a string, as in `workflow.steps.attempts`. */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every dotted path to a group of strings, as in `integrations.detail.status`. */
type Branches<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? never : `${P}${K}` | Branches<T[K], `${P}${K}.`>;
}[keyof T & string];

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type WithoutPlural<K> = K extends `${infer Base}_${PluralSuffix}` ? Base : K;

/** A key `t()` takes; a plural is read by its base key with a `count`. */
export type TranslationKey = WithoutPlural<Leaves<Strings>>;
export type TranslationGroup = Branches<Strings>;
export type TranslationOptions = { count?: number } & Record<string, unknown>;

const LANGUAGE = 'en';
const plurals = new Intl.PluralRules(LANGUAGE);

function lookup(path: string): unknown {
  let node: unknown = en;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function interpolate(text: string, values: TranslationOptions): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

function t(key: TranslationKey, options?: TranslationOptions): string;
function t<T = Record<string, string>>(key: TranslationGroup, options: TranslationOptions & { returnObjects: true }): T;
function t(key: string, options: TranslationOptions & { returnObjects?: boolean } = {}): unknown {
  if (options.returnObjects) return lookup(key);
  let text = lookup(key);
  if (typeof options.count === 'number') {
    const plural = lookup(`${key}_${plurals.select(options.count)}`) ?? lookup(`${key}_other`);
    if (typeof plural === 'string') text = plural;
  }
  return typeof text === 'string' ? interpolate(text, options) : key;
}

export type TFunction = typeof t;

/** The same shape as react-i18next's hook, so components read strings as they did. */
export function useTranslation(): { t: TFunction } {
  return { t };
}

/** The language the portal renders in, for `Intl` and cronstrue. */
export function currentLanguage(): string {
  return LANGUAGE;
}

const i18n = { t };

export default i18n;
