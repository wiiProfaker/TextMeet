// Тестовая копия собранной программы для Playwright (решения Плана 8, §5.1). В выпуске Node-fuses выключены и
// тестовые подмены не действуют; Playwright же запускает программу с --inspect=0 и -r loader.js, а сквозной тест
// собранной программы — с подменами. Копия получает обратно три Node-fuses и файл-признак тестовой сборки в
// resources/ (src/main/test-hooks.ts). Проверка целостности app.asar на копии остаётся.
// Запуск: node scripts/make-test-copy.mjs <release/win-unpacked | …/TextMeet.app> <папка копии | …/TextMeet.app>
import { cp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import fuses from '@electron/fuses';

const { flipFuses, FuseV1Options, FuseVersion } = fuses;

/** Совпадает с TEST_BUILD_MARKER в src/main/test-hooks.ts. */
const TEST_BUILD_MARKER = 'textmeet-test-build';

const [app, out] = process.argv.slice(2);
if (!app || !out) {
  console.error('Запуск: node scripts/make-test-copy.mjs <собранная программа> <куда положить копию>');
  process.exit(2);
}
const mac = app.endsWith('.app');
await rm(out, { recursive: true, force: true });
// verbatimSymlinks: в .app на Mac ссылки внутри фреймворков должны остаться ссылками.
await cp(app, out, { recursive: true, verbatimSymlinks: true });
await writeFile(join(out, mac ? join('Contents', 'Resources') : 'resources', TEST_BUILD_MARKER), '');
await flipFuses(mac ? out : join(out, 'TextMeet.exe'), {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: mac,
  [FuseV1Options.RunAsNode]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: true,
  [FuseV1Options.EnableNodeCliInspectArguments]: true,
});
console.log(`Тестовая копия: ${out}`);
