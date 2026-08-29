import type { UrhobaApi } from '../preload';

declare global {
  interface Window {
    urhoba: UrhobaApi;
  }
}

export {};
