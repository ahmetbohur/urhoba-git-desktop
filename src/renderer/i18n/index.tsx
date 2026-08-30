import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { en } from './en';

/**
 * Çeviri katmanı.
 *
 * Anahtar olarak Türkçe metnin kendisini kullanıyoruz: `t('Vazgeç')`. Bunun iki
 * pratik faydası var — her metin için ayrı bir anahtar icat etmek gerekmiyor ve
 * sözlükte karşılığı olmayan bir metin boş dize yerine anlamlı Türkçe hâliyle
 * görünüyor. Bedeli, kaynak metin değiştiğinde sözlük girdisinin de
 * güncellenmesi; tek dilli bir sözlük için bu takas doğru tarafta.
 *
 * Değişkenler `{ad}` biçiminde yazılıp çağrı sırasında dolduruluyor; böylece
 * cümle sırası dile göre değişebiliyor.
 */

export type Language = 'tr' | 'en';

type Dictionary = Record<string, string>;

const DICTIONARIES: Record<Language, Dictionary> = {
  tr: {},
  en,
};

export type Translate = (text: string, vars?: Record<string, string | number>) => string;

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

const LanguageContext = createContext<Language>('tr');

export function LanguageProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): Language {
  return useContext(LanguageContext);
}

export function useT(): Translate {
  const language = useLanguage();
  return useMemo(() => {
    const dictionary = DICTIONARIES[language] ?? {};
    return (text: string, vars?: Record<string, string | number>) =>
      interpolate(dictionary[text] ?? text, vars);
  }, [language]);
}
