// Значки программы из SVG (решения Плана 8, §3): Electron без окна на экране рисует build/icon.svg и
// build/icon-mac.svg в PNG 1024×1024 с прозрачными углами; .ico и .icns из них делает electron-builder.
// Запуск: npm run icons (npx electron scripts/render-icons.cjs). Новых зависимостей не нужно.
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const SIZE = 1024;
const BUILD = join(__dirname, '..', 'build');
const ICONS = [
  ['icon.svg', 'icon.png'],
  ['icon-mac.svg', 'icon-mac.png'],
];

async function render(svgFile, pngFile) {
  const win = new BrowserWindow({
    show: false,
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });
  const svg = readFileSync(join(BUILD, svgFile), 'utf8');
  const html =
    '<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}' +
    `img{display:block;width:${SIZE}px;height:${SIZE}px}</style></head><body>` +
    `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`;
  let sized;
  try {
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    await win.webContents.executeJavaScript('document.querySelector("img").decode()');
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
    sized = image.getSize().width === SIZE ? image : image.resize({ width: SIZE, height: SIZE, quality: 'best' });
    writeFileSync(join(BUILD, pngFile), sized.toPNG());
  } finally {
    win.destroy();
  }
  console.log(`${pngFile}: ${sized.getSize().width}×${sized.getSize().height}`);
}

app.disableHardwareAcceleration();
// Закрыли окно первого значка — программа не должна завершиться до второго.
app.on('window-all-closed', () => undefined);
app
  .whenReady()
  .then(async () => {
    for (const [svg, png] of ICONS) await render(svg, png);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => app.quit());
