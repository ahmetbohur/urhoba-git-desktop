import { contextBridge, ipcRenderer } from 'electron';
import { APP_EVENT_CHANNEL, IPC_CHANNELS, isIpcError, type IpcChannel } from '@shared/ipc-channels';
import type { IpcInput, IpcOutput } from '@shared/ipc-contract';
import type { AppEvent } from '@shared/types';

/**
 * Güven sınırı.
 *
 * Arayüze `ipcRenderer` değil, sözleşmedeki kanallarla sınırlı tek bir `invoke`
 * fonksiyonu veriliyor. Kanal adı listede yoksa çağrı ana sürece hiç ulaşmıyor;
 * böylece renderer'da çalışan üçüncü parti bir kod (bir npm bağımlılığı dahil)
 * keyfi IPC kanalı deneyemiyor.
 */

const allowedChannels = new Set<string>(IPC_CHANNELS);

const api = {
  async invoke<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcOutput<C>> {
    if (!allowedChannels.has(channel)) {
      throw new Error(`Bilinmeyen IPC kanalı: ${channel}`);
    }
    const result: unknown = await ipcRenderer.invoke(channel, input);
    if (isIpcError(result)) {
      // Ana süreç hatayı zarflayarak döndürüyor; burada tekrar Error'a çeviriyoruz
      // ki arayüzdeki try/catch'ler normal şekilde çalışsın.
      const error = new Error(result.message);
      error.name = 'GitError';
      Object.assign(error, { detail: result.detail });
      throw error;
    }
    return result as IpcOutput<C>;
  },

  /** Ana süreçten gelen olaylara abone olur; dönen fonksiyon aboneliği iptal eder. */
  onEvent(listener: (event: AppEvent) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, payload: AppEvent) => listener(payload);
    ipcRenderer.on(APP_EVENT_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(APP_EVENT_CHANNEL, handler);
    };
  },

  platform: process.platform,
};

export type UrhobaApi = typeof api;

contextBridge.exposeInMainWorld('urhoba', api);
