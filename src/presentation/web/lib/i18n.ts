/**
 * Web UI i18n configuration.
 *
 * Initializes i18next with react-i18next for the web presentation layer.
 * Uses the common and web namespaces. All supported language translations
 * are bundled inline so language switching works immediately.
 */

import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import all language translations inline
import commonEn from '../../../../translations/en/common.json';
import webEn from '../../../../translations/en/web.json';
import commonUk from '../../../../translations/uk/common.json';
import webUk from '../../../../translations/uk/web.json';
import commonRu from '../../../../translations/ru/common.json';
import webRu from '../../../../translations/ru/web.json';
import commonPt from '../../../../translations/pt/common.json';
import webPt from '../../../../translations/pt/web.json';
import commonEs from '../../../../translations/es/common.json';
import webEs from '../../../../translations/es/web.json';
import commonAr from '../../../../translations/ar/common.json';
import webAr from '../../../../translations/ar/web.json';
import commonHe from '../../../../translations/he/common.json';
import webHe from '../../../../translations/he/web.json';
import commonFr from '../../../../translations/fr/common.json';
import webFr from '../../../../translations/fr/web.json';
import commonDe from '../../../../translations/de/common.json';
import webDe from '../../../../translations/de/web.json';

const FALLBACK_LANGUAGE = 'en';
const NAMESPACES = ['common', 'web'] as const;

/**
 * Create and configure the web i18next instance.
 *
 * Returns a singleton instance — multiple calls return the same object.
 * Use `changeLanguage()` on the returned instance to switch locales at runtime.
 */
function createI18nInstance(): i18n {
  const instance = i18next.createInstance();

  instance.use(initReactI18next).init({
    lng: FALLBACK_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    defaultNS: 'common',
    ns: [...NAMESPACES],
    resources: {
      en: { common: commonEn, web: webEn },
      uk: { common: commonUk, web: webUk },
      ru: { common: commonRu, web: webRu },
      pt: { common: commonPt, web: webPt },
      es: { common: commonEs, web: webEs },
      ar: { common: commonAr, web: webAr },
      he: { common: commonHe, web: webHe },
      fr: { common: commonFr, web: webFr },
      de: { common: commonDe, web: webDe },
    },
    interpolation: {
      escapeValue: false, // React already escapes output
    },
    react: {
      useSuspense: false, // Avoid suspense boundaries for i18n
    },
  });

  return instance;
}

/** Singleton web i18next instance. */
const webI18n: i18n = createI18nInstance();

export default webI18n;
export { FALLBACK_LANGUAGE, NAMESPACES };
