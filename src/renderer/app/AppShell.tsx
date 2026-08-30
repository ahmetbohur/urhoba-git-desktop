import { useEffect, type ReactNode } from 'react';
import { LanguageProvider } from '../i18n';
import { setFormatLanguage } from '../lib/format';
import { useSettings } from '../lib/queries';

/**
 * Dil kabuğu.
 *
 * Ayarlardaki dil tercihi hem React bağlamına hem de tarih/sayı
 * biçimlendiricilerine buradan aktarılıyor. Biçimlendiriciler bağlamı okuyamadığı
 * için (bileşen dışında da çağrılıyorlar) modül düzeyinde bir kez ayarlanıyorlar.
 *
 * Ayarlar yüklenene kadar Türkçe varsayılıyor; bu, uygulamanın ilk karesinde
 * boş bir ekran göstermemek için bilinçli bir tercih.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: settings } = useSettings();
  const language = settings?.language ?? 'tr';

  useEffect(() => {
    setFormatLanguage(language);
  }, [language]);

  return (
    <LanguageProvider language={language}>
      <div key={language} className="h-full">
        {children}
      </div>
    </LanguageProvider>
  );
}
