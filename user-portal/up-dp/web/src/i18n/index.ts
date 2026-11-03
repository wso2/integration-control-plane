/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
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
