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

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';

/** Every language the portal ships, keyed by its BCP 47 tag. English is the source and the fallback. */
export const resources = {
  en: { translation: en },
} as const;

/** A language picked for this browser; nothing in the portal sets it yet, so it wins over the browser's only when set by hand. */
export const LANGUAGE_KEY = 'user-portal:language';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: Object.keys(resources),
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: LANGUAGE_KEY, caches: [] },
  });

document.documentElement.lang = i18n.resolvedLanguage ?? 'en';
i18n.on('languageChanged', () => {
  document.documentElement.lang = i18n.resolvedLanguage ?? 'en';
});

/** The language the portal renders in, for `Intl` and cronstrue: always one in `resources`. */
export function currentLanguage(): string {
  return i18n.resolvedLanguage ?? 'en';
}

export default i18n;
