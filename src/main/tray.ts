import { Menu, nativeImage, Tray, type NativeImage } from 'electron';
import type { RecordingPhase } from '../shared/recording';
import { drawCircleIcon, drawRecordingIcon, type Rgb } from './icons/circle-icon';
import { encodePng } from './icons/png';
import { buildTrayMenu, type TrayActions } from './tray-menu';

// macOS: чёрный шаблон — система сама перекрашивает его под светлую/тёмную строку меню;
// цветную точку шаблон не покажет, поэтому во время записи там закрашенный круг.
const MAC_TEMPLATE_COLOR: Rgb = { r: 0, g: 0, b: 0 };
// Windows: синий заметен и на светлой, и на тёмной панели задач.
const WINDOWS_COLOR: Rgb = { r: 59, g: 130, b: 246 };

function icon(recording: boolean): NativeImage {
  const isMac = process.platform === 'darwin';
  const draw = (size: number): Uint8Array => {
    if (isMac) return drawCircleIcon(size, MAC_TEMPLATE_COLOR, recording ? 'dot' : 'ring');
    return recording ? drawRecordingIcon(size, WINDOWS_COLOR) : drawCircleIcon(size, WINDOWS_COLOR, 'ring');
  };
  const image = nativeImage.createFromBuffer(encodePng(16, 16, draw(16)), { scaleFactor: 1 });
  image.addRepresentation({ scaleFactor: 2, buffer: encodePng(32, 32, draw(32)) });
  if (isMac) image.setTemplateImage(true);
  return image;
}

export interface AppTray {
  /** Значок, подсказка и меню под состояние записи и текущую горячую клавишу. */
  update(phase: RecordingPhase, hotkey: string): void;
}

export function createTray(actions: TrayActions, hotkey: string): AppTray {
  const idle = icon(false);
  const recordingIcon = icon(true);
  const tray = new Tray(idle);
  // На Windows привычно открывать окно щелчком по значку; на macOS щелчок открывает меню.
  if (process.platform === 'win32') tray.on('click', () => actions.openWindow());

  let last = '';
  const update = (phase: RecordingPhase, key: string): void => {
    const signature = `${phase}|${key}`;
    if (signature === last) return;
    last = signature;
    const recording = phase === 'recording' || phase === 'stopping';
    tray.setImage(recording ? recordingIcon : idle);
    tray.setToolTip(recording ? 'TextMeet — идёт запись' : 'TextMeet');
    tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenu(actions, { phase, hotkey: key })));
  };
  update('idle', hotkey);
  // Ссылку на трей держит замыкание update — иначе сборщик мусора убрал бы значок.
  return { update };
}
