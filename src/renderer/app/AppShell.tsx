import { useEffect, type ReactNode } from 'react';
import { LanguageProvider } from '../i18n';
import { setFormatLanguage } from '../lib/format';
import { useSettings } from '../lib/queries';

/**
 * Dil ve tema kabuğu.
 *
 * Ayarlardaki dil tercihi hem React bağlamına hem de tarih/sayı
 * biçimlendiricilerine buradan aktarılıyor. Biçimlendiriciler bağlamı okuyamadığı
 * için (bileşen dışında da çağrılıyorlar) modül düzeyinde bir kez ayarlanıyorlar.
 *
 * Tema tercihi kök öğeye `data-theme` olarak yazılıyor. Yalnızca ana süreçteki
 * `nativeTheme.themeSource` ayarına güvenmek yetmiyor: o ayar Linux'ta
 * `prefers-color-scheme` medya sorgusunu etkilemiyor, dolayısıyla tema seçimi
 * ekrana hiç yansımıyordu. "Sistem" seçiliyken öznitelik hiç yazılmıyor ve
 * karar yine medya sorgusuna kalıyor.
 *
 * Ayarlar yüklenene kadar Türkçe ve sistem teması varsayılıyor; bu, uygulamanın
 * ilk karesinde boş bir ekran göstermemek için bilinçli bir tercih.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: settings } = useSettings();
  const language = settings?.language ?? 'tr';
  const theme = settings?.theme ?? 'system';

  useEffect(() => {
    setFormatLanguage(language);
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <LanguageProvider language={language}>
      <div key={language} className="h-full">
        {children}
      </div>
    </LanguageProvider>
  );
}
