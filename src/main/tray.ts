import { Menu, nativeImage, Tray, type NativeImage } from 'electron';
import { drawCircleIcon, type Rgb } from './icons/circle-icon';
import { encodePng } from './icons/png';
import { buildTrayMenu, type TrayActions } from './tray-menu';

// macOS: чёрный шаблон — система сама перекрашивает его под светлую/тёмную строку меню.
const MAC_TEMPLATE_COLOR: Rgb = { r: 0, g: 0, b: 0 };
// Windows: синий заметен и на светлой, и на тёмной панели задач.
const WINDOWS_COLOR: Rgb = { r: 59, g: 130, b: 246 };

function idleIcon(): NativeImage {
  const isMac = process.platform === 'darwin';
  const color = isMac ? MAC_TEMPLATE_COLOR : WINDOWS_COLOR;
  const image = nativeImage.createFromBuffer(encodePng(16, 16, drawCircleIcon(16, color, 'ring')), { scaleFactor: 1 });
  image.addRepresentation({ scaleFactor: 2, buffer: encodePng(32, 32, drawCircleIcon(32, color, 'ring')) });
  if (isMac) image.setTemplateImage(true);
  return image;
}

export function createTray(actions: TrayActions): Tray {
  const tray = new Tray(idleIcon());
  tray.setToolTip('TextMeet');
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenu(actions)));
  // На Windows привычно открывать окно щелчком по значку; на macOS щелчок открывает меню.
  if (process.platform === 'win32') tray.on('click', () => actions.openWindow());
  return tray;
}
