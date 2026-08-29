import { BrowserWindow } from 'electron';
import { APP_EVENT_CHANNEL } from '@shared/ipc-channels';
import type { AppEvent } from '@shared/types';

/** Olayı açık olan bütün pencerelere yayınla. */
export function emitAppEvent(event: AppEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(APP_EVENT_CHANNEL, event);
    }
  }
}
