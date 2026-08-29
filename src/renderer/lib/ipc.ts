import type { IpcChannel, IpcInput, IpcOutput } from '@shared/ipc-contract';
import type { AppEvent } from '@shared/types';

/**
 * Preload'daki köprünün ince sarmalayıcısı. Arayüzün geri kalanı `window` nesnesine
 * hiç dokunmaz; test etmek gerektiğinde burayı değiştirmek yeterli.
 */
export function invoke<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcOutput<C>> {
  return window.urhoba.invoke(channel, input);
}

export function onAppEvent(listener: (event: AppEvent) => void): () => void {
  return window.urhoba.onEvent(listener);
}

export const platform = window.urhoba.platform;

/** Hata nesnesinden kullanıcıya gösterilecek metni çıkarır. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
