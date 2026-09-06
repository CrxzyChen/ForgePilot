import type { StudioDesktopApi } from './contracts.ts';

declare global {
  interface Window {
    aiGameStudio: StudioDesktopApi;
  }
}

export {};
