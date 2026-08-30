import { useEffect, useMemo, useState } from 'react';
import { FileWarning } from 'lucide-react';
import { useT } from '../i18n';
import { invoke } from '../lib/ipc';
import { useQuery } from '../lib/queries';
import { EmptyState, Spinner } from './primitives';
import type { FilePreview } from '@shared/types';

/**
 * İkili dosyaların içerik önizlemesi.
 *
 * Diff bir görüntüde ya da videoda hiçbir şey anlatmıyor; git yalnızca "Binary
 * files differ" diyor. Bu dosyalarda içeriğin kendisi, eski ve yeni hâli yan
 * yana gösteriliyor.
 *
 * Hangi uzantıların önizlenebildiği yalnızca ana süreçte tanımlı. Arayüz o
 * listenin bir kopyasını tutmuyor: iki liste zamanla ayrışıyor ve kullanıcı
 * "destekleniyor ama açılmıyor" durumuyla karşılaşıyor. Burada karar veriye
 * bakılarak veriliyor — iki sürüm de boş dönerse dosya önizlenemiyor demek.
 */

function useObjectUrl(preview: FilePreview | null | undefined): string | null {
  const url = useMemo(() => {
    if (!preview) return null;
    const binary = atob(preview.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return URL.createObjectURL(new Blob([bytes], { type: preview.mime }));
  }, [preview]);

  /*
   * Adres serbest bırakılmazsa dosyadan dosyaya gezinirken bellek birikiyor.
   * `data:` adresi yerine blob kullanmamızın sebebi de bu: birkaç megabaytlık
   * bir dosyada `data:` DOM'a devasa bir dize gömüyor ve bırakılamıyor.
   */
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Media({
  preview,
  url,
  onFailed,
}: {
  preview: FilePreview;
  url: string;
  onFailed: () => void;
}) {
  const t = useT();

  switch (preview.kind) {
    case 'image':
      return (
        <img
          src={url}
          alt=""
          onError={onFailed}
          /*
           * Damalı zemin saydamlığı görünür kılıyor: saydam bir PNG düz beyaz
           * zeminde "beyaz dolu" görünüyor ve neyin saydam olduğu anlaşılmıyor.
           */
          className="checkerboard max-h-full max-w-full object-contain"
        />
      );
    case 'video':
      return <video src={url} controls onError={onFailed} className="max-h-full max-w-full" />;
    case 'audio':
      return <audio src={url} controls onError={onFailed} className="w-full" />;
    case 'font': {
      // Yazı tipinde gösterilecek şey dosya değil, onunla yazılmış metin.
      const family = `urhoba-preview-${preview.bytes}`;
      return (
        <div className="flex flex-col gap-2 text-center">
          <style>{`@font-face { font-family: "${family}"; src: url("${url}"); }`}</style>
          {/*
            Türkçe ve İngilizce harfler birlikte veriliyor: eksik bir glif
            ancak kendi harfi denendiğinde ortaya çıkıyor.
          */}
          <p className="text-[26px] leading-tight text-ink" style={{ fontFamily: `"${family}"` }}>
            ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ
            <br />
            abcçdefgğhıijklmnoöprsştuüvyz
            <br />
            0123456789
          </p>
          <p className="text-[11px] text-ink-3">{t('Bu yazı tipiyle yazılmış örnek metin.')}</p>
        </div>
      );
    }
  }
}

function Side({
  preview,
  isLoading,
  label,
  onFailed,
}: {
  preview: FilePreview | null | undefined;
  isLoading: boolean;
  label: string;
  onFailed: () => void;
}) {
  const t = useT();
  const url = useObjectUrl(preview);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <p className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">{label}</p>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-line bg-ground p-3">
        {isLoading ? (
          <Spinner />
        ) : !preview || !url ? (
          // Dosya o sürümde yoksa: yeni eklenmiş ya da silinmiş demek.
          <p className="text-[12px] text-ink-3">{t('Yok')}</p>
        ) : (
          <Media preview={preview} url={url} onFailed={onFailed} />
        )}
      </div>
      {preview && <p className="text-[11px] text-ink-3">{formatBytes(preview.bytes)}</p>}
    </div>
  );
}

function usePreview(repoId: string, path: string, gitRef: string | null) {
  return useQuery<FilePreview | null>({
    queryKey: ['file-preview', repoId, path, gitRef],
    queryFn: () => invoke('git:file-preview', { repoId, path, ref: gitRef }),
    // Bir commit'teki içerik değişmiyor; dosyalar arasında gezinirken yeniden
    // çekmenin anlamı yok.
    staleTime: 60_000,
  });
}

export function FilePreviewView({
  repoId,
  path,
  beforeRef,
  afterRef,
}: {
  repoId: string;
  path: string;
  /** null: çalışma dizinindeki hâli. */
  beforeRef: string | null;
  afterRef: string | null;
}) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const before = usePreview(repoId, path, beforeRef);
  const after = usePreview(repoId, path, afterRef);

  const loading = before.isLoading || after.isLoading;
  const nothingToShow = !loading && !before.data && !after.data;

  if (failed || nothingToShow) {
    return (
      <EmptyState
        icon={<FileWarning className="size-5" />}
        title={t('İkili dosya')}
        description={t('Bu dosyanın içeriği metin olarak karşılaştırılamıyor.')}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-3 p-3">
      <Side
        preview={before.data}
        isLoading={before.isLoading}
        label={t('Önce')}
        onFailed={() => setFailed(true)}
      />
      <Side
        preview={after.data}
        isLoading={after.isLoading}
        label={t('Sonra')}
        onFailed={() => setFailed(true)}
      />
    </div>
  );
}
