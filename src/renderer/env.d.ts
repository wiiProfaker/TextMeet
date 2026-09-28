/// <reference types="vite/client" />
import type { RecorderBridge, TextMeetApi } from '../shared/ipc';

declare global {
  interface Window {
    /** API главного окна (preload/index.ts). */
    textmeet: TextMeetApi;
    /** API окна записи (preload/index.ts). */
    recorder: RecorderBridge;
  }
}

export {};
