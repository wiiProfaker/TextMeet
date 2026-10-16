// Движок итогов — llama.cpp (llama-server, решения Плана 9, §4.1). Скрипт скачивает выпуск ggml-org для этой системы,
// сверяет SHA-256 и кладёт нужные файлы в vendor/llama/: оттуда их берёт electron-builder (extraResources →
// resources/llama) и версия для разработки. Уже на месте (vendor/llama/.build совпадает) — ничего не делает.
// Запуск: npm run fetch:llama (сам — перед dist:win, dist:mac и test:llm). С --optional (перед dev и start) неудача —
// только предупреждение: без движка программа работает, нет лишь итогов.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const RELEASE = 'https://github.com/ggml-org/llama.cpp/releases/download/b11588';
/** Сборки движка: Windows — Vulkan (видеокарты NVIDIA, AMD, Intel), Mac — Metal. SHA-256 — из выпуска на GitHub. */
const BUILDS = {
  'win32-x64': {
    file: 'llama-b11588-bin-win-vulkan-x64.zip',
    size: 32_112_046,
    sha256: '696f75ee2aa8047cd6a7c67e37f4c251d609ef3450a9cdab298e7429adf19944',
    folder: '.',
  },
  'darwin-arm64': {
    file: 'llama-b11588-bin-macos-arm64.tar.gz',
    size: 12_112_245,
    sha256: '95039180209cb8b9a2fadedd03e061c5131fed17e1eb423b3dcf8c7848d12b9d',
    folder: 'llama-b11588',
  },
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'vendor', 'llama');
const stamp = join(target, '.build');

/**
 * Из выпуска нужен только сервер и его библиотеки: остальные программы llama.cpp и их «-impl»-библиотеки программе
 * ни к чему. Ссылки на библиотеки (на Mac) сохраняются как ссылки.
 */
function keep(name) {
  if (name === 'llama-server' || name === 'llama-server.exe' || name.startsWith('LICENSE')) return true;
  if (/-impl\.(dll|dylib)$/.test(name)) return name.startsWith('llama-server-impl.') || name.startsWith('libllama-server-impl.');
  return /\.(dll|dylib)$/.test(name);
}

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function main() {
  const build = BUILDS[`${process.platform}-${process.arch}`];
  if (!build) {
    console.log(`fetch-llama: для ${process.platform}-${process.arch} сборки движка нет — пропускаем`);
    return;
  }
  const done = await fsp.readFile(stamp, 'utf8').catch(() => '');
  if (done.trim() === build.sha256) return;

  const work = join(root, 'vendor', `llama-download-${process.pid}`);
  await fsp.rm(work, { recursive: true, force: true });
  await fsp.mkdir(work, { recursive: true });
  try {
    const archive = join(work, build.file);
    console.log(`fetch-llama: скачиваем ${build.file}`);
    const response = await fetch(`${RELEASE}/${build.file}`);
    if (!response.ok || !response.body) throw new Error(`сервер ответил ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    const { size } = await fsp.stat(archive);
    const sum = await sha256(archive);
    if (size !== build.size || sum !== build.sha256) throw new Error(`архив не совпал: ${size} байт, SHA-256 ${sum}`);

    // tar (bsdtar) есть и на Windows 10+, и на Mac; zip он тоже распаковывает. На Windows — системный: GNU tar из
    // Git Bash принял бы «D:» за адрес другого компьютера.
    const unpacked = join(work, 'unpacked');
    await fsp.mkdir(unpacked);
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    execFileSync(tar, ['-xf', archive, '-C', unpacked], { stdio: 'inherit' });

    const from = join(unpacked, build.folder);
    await fsp.rm(target, { recursive: true, force: true });
    await fsp.mkdir(target, { recursive: true });
    for (const entry of await fsp.readdir(from, { withFileTypes: true })) {
      if (!keep(entry.name)) continue;
      const source = join(from, entry.name);
      const dest = join(target, entry.name);
      if (entry.isSymbolicLink()) await fsp.symlink(await fsp.readlink(source), dest);
      else await fsp.copyFile(source, dest);
    }
    await fsp.writeFile(stamp, `${build.sha256}\n`);
    console.log(`fetch-llama: движок в ${target}`);
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  const optional = process.argv.includes('--optional');
  console.error(`fetch-llama: ${err instanceof Error ? err.message : String(err)}${optional ? ' — без движка итогов' : ''}`);
  process.exit(optional ? 0 : 1);
});
