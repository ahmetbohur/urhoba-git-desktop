import { BrowserWindow, Notification } from 'electron';
import { collectSince } from './activity';
import { emitAppEvent } from './events';
import { log } from './logger';
import * as store from './store';
import * as ai from '../ai/service';
import type { ActivityPeriod, ActivitySummary } from '@shared/types';

/**
 * Kendiliğinden çıkan etkinlik özeti.
 *
 * Aralık "son özetten beri" olarak hesaplanıyor, "şu andan geriye" olarak
 * değil. İkisi arasındaki fark uygulama kapalıyken ortaya çıkıyor: sabit bir
 * geriye bakış üç gün kapalı kalan bir uygulamada aradaki iki günü
 * atlıyor. Son özetin anı diske yazıldığı için art arda gelen iki özet ne
 * çakışıyor ne de arada boşluk bırakıyor.
 */

const PERIOD_MS: Record<ActivityPeriod, number> = {
  '1h': 3600_000,
  '6h': 6 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
};

/** Zamanı sık kontrol ediyoruz; asıl karar diskteki son özet anına bakılarak veriliyor. */
const CHECK_INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

/** Bildirimde gösterilecek kısa metin. */
function countsLine(summary: ActivitySummary): string {
  const parts: string[] = [];
  if (summary.authoredCount > 0) parts.push(`${summary.authoredCount} commit yazdın`);
  if (summary.arrivedCount > 0) parts.push(`${summary.arrivedCount} commit indi`);
  return `${parts.join(', ')} · ${summary.repos.length} depo`;
}

/**
 * Bildirim gövdesi.
 *
 * AI yalnızca yerel modelle kullanılıyor. Zamanlayıcıya bağlı, kullanıcının o
 * an bir şeye basmadığı bir çağrı bulut sağlayıcıya veri göndermemeli — ne
 * gizlilik ne de ücret açısından. Yerel modelde ikisi de sorun değil.
 */
async function digestBody(summary: ActivitySummary): Promise<string> {
  const counts = countsLine(summary);
  const status = ai.getStatusSummary(null);
  if (!status.enabled || !status.isLocal) return counts;

  try {
    const digest = await ai.summarizeActivity(summary);
    return digest.text || counts;
  } catch {
    // Model yanıt vermezse bildirim yine de çıkmalı; sayılar da bilgi.
    return counts;
  }
}

async function runIfDue(): Promise<void> {
  const settings = store.getSettings();
  if (!settings.activityAuto) return;

  const now = new Date();
  const last = store.getLastActivityDigestAt();
  if (!last) {
    // İlk açılışta hemen özet çıkarmıyoruz; sayaç bugünden başlıyor.
    store.setLastActivityDigestAt(now);
    return;
  }

  if (now.getTime() - last.getTime() < PERIOD_MS[settings.activityPeriod]) return;

  const summary = await collectSince(last, settings.activityPeriod);
  store.setLastActivityDigestAt(now);

  /*
   * Boş özet bildirim üretmiyor. "0 commit" diye bildirim atmak, kullanıcının
   * bildirimleri kapatmasının en hızlı yolu.
   */
  if (summary.repos.length === 0) return;

  const body = await digestBody(summary);
  log('info', 'Kendiliğinden etkinlik özeti', {
    repos: summary.repos.length,
    authored: summary.authoredCount,
    arrived: summary.arrivedCount,
  });

  if (!Notification.isSupported()) return;
  const notification = new Notification({ title: 'Etkinlik özeti', body });
  notification.on('click', () => {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
    emitAppEvent({ type: 'activity:open' });
  });
  notification.show();
}

export function startActivitySchedule(): void {
  stopActivitySchedule();
  timer = setInterval(() => {
    void runIfDue().catch((error) => {
      log('warn', 'Etkinlik özeti çıkarılamadı', { error: String(error) });
    });
  }, CHECK_INTERVAL_MS);
  // İlk kontrol hemen: uygulama kapalıyken vakti gelmiş olabilir.
  void runIfDue().catch(() => undefined);
}

export function stopActivitySchedule(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
