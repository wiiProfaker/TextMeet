// Файл THIRD-PARTY-NOTICES.txt (решения Плана 8, §4.3): что входит в программу и что скачивается в неё, с лицензиями.
// Источник — licenses/third-party.json (вручную, лицензии моделей сверены с карточками моделей) и дерево зависимостей
// из package-lock.json (то, что electron-builder кладёт в app.asar вместе с пакетами из dependencies). Файл лежит в
// репозитории и попадает в resources/ собранной программы.
// Запуск: npm run notices — записать файл; npm run notices -- --check — не писать, упасть, если файл устарел (ci).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'THIRD-PARTY-NOTICES.txt');
const LICENSE_NAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.markdown', 'license', 'license.md', 'LICENCE'];

const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trimEnd();
const pkg = JSON.parse(read(join(root, 'package.json')));
const lock = JSON.parse(read(join(root, 'package-lock.json')));
const entries = JSON.parse(read(join(root, 'licenses', 'third-party.json')));

/**
 * Пакеты, которые приходят в программу вместе с dependencies (по package-lock.json). Платформенные (поле os —
 * sherpa-onnx-win-x64 и т. п.) не берём: на каждой системе ставится свой, и файл не должен зависеть от системы.
 */
function dependencyTree() {
  const packages = lock.packages;
  const found = new Map();
  const resolve = (name, from) => {
    // Как Node ищет пакет: в node_modules рядом, потом выше по дереву.
    let base = from;
    for (;;) {
      const key = `${base ? `${base}/` : ''}node_modules/${name}`;
      if (packages[key]) return key;
      if (!base) return null;
      const at = base.lastIndexOf('/node_modules/');
      base = at === -1 ? '' : base.slice(0, at);
    }
  };
  const visit = (name, from) => {
    const key = resolve(name, from);
    if (!key || found.has(key)) return;
    const info = packages[key];
    if (info.os) return;
    found.set(key, { name, version: info.version, license: info.license ?? null, path: key });
    for (const dep of Object.keys({ ...info.dependencies, ...info.optionalDependencies })) visit(dep, key);
  };
  for (const dep of Object.keys(pkg.dependencies)) visit(dep, '');
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function licenseText(dir) {
  for (const name of LICENSE_NAMES) {
    const file = join(root, dir, name);
    if (existsSync(file)) return read(file);
  }
  return null;
}

function build() {
  const bundled = entries.filter((e) => e.kind === 'bundled');
  const downloaded = entries.filter((e) => e.kind === 'downloaded');
  const listed = new Set(bundled.map((e) => e.name));
  const extra = dependencyTree().filter((d) => !listed.has(d.name));

  /** Тексты лицензий без повторов: одинаковый текст — один раз, со списком тех, к кому относится. */
  const texts = new Map();
  const addText = (text, who) => {
    if (!text) return;
    const list = texts.get(text) ?? [];
    if (!list.includes(who)) list.push(who);
    texts.set(text, list);
  };
  for (const e of bundled) if (e.licenseFile) addText(read(join(root, e.licenseFile)), e.name);
  for (const d of extra) {
    const license = d.license ?? JSON.parse(read(join(root, d.path, 'package.json'))).license ?? 'см. текст ниже';
    d.license = license;
    addText(licenseText(d.path), `${d.name} ${d.version}`);
  }

  const lines = [];
  const rule = (title, char) => lines.push(title, char.repeat(title.length), '');
  lines.push(`TextMeet ${pkg.version} — чужие программы, шрифты и модели и их лицензии`, '');
  lines.push(
    'TextMeet собран из открытых программ и шрифтов; модели для расшифровки и итогов скачиваются по вашей просьбе с',
    'сайтов их авторов. Ниже — кто их сделал, под какой лицензией они распространяются и где их найти.',
    '',
  );
  rule('В составе программы', '=');
  for (const e of bundled) {
    lines.push(`- ${e.name} — ${e.author}. Лицензия: ${e.license}. ${e.url}`);
    if (e.notice) lines.push(`  ${e.notice}`);
  }
  lines.push('');
  if (extra.length > 0) {
    lines.push('Пакеты, которые нужны перечисленным выше:');
    for (const d of extra) lines.push(`- ${d.name} ${d.version}. Лицензия: ${d.license}.`);
    lines.push('');
  }
  rule('Скачивается по вашей просьбе (модели)', '=');
  for (const e of downloaded) {
    lines.push(`- ${e.name} — ${e.author}. Лицензия: ${e.license}. ${e.url}`);
    if (e.notice) lines.push(`  ${e.notice}`);
  }
  lines.push('');
  rule('Тексты лицензий', '=');
  for (const [text, who] of texts) {
    rule(who.join(', '), '-');
    lines.push(text, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

const next = build();
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? read(OUT) + '\n' : '';
  if (current !== next) {
    console.error('THIRD-PARTY-NOTICES.txt устарел: запустите npm run notices и добавьте файл в коммит.');
    process.exit(1);
  }
  console.log('THIRD-PARTY-NOTICES.txt в порядке.');
} else {
  writeFileSync(OUT, next);
  console.log(`Записан ${OUT}`);
}
