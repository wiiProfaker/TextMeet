// Проверка собранной программы: Node-fuses выключены (решения Плана 8, §5.1). Падает с понятным сообщением, если
// хоть один включён. Запуск: node scripts/check-fuses.mjs <TextMeet.exe | TextMeet.app>
import fuses from '@electron/fuses';

const { FuseV1Options, getCurrentFuseWire } = fuses;
/** Состояние fuse в файле — код символа: «0» выключен, «1» включён (FuseState в @electron/fuses, наружу не отдаётся). */
const FuseState = { DISABLE: 48, ENABLE: 49 };

const NODE_FUSES = [
  FuseV1Options.RunAsNode,
  FuseV1Options.EnableNodeOptionsEnvironmentVariable,
  FuseV1Options.EnableNodeCliInspectArguments,
];

const target = process.argv[2];
if (!target) {
  console.error('Укажите путь к собранной программе: node scripts/check-fuses.mjs <TextMeet.exe | TextMeet.app>');
  process.exit(2);
}
const wire = await getCurrentFuseWire(target);
const enabled = NODE_FUSES.filter((fuse) => wire[fuse] !== FuseState.DISABLE).map((fuse) => FuseV1Options[fuse]);
if (enabled.length > 0) {
  console.error(`В ${target} не выключены fuses: ${enabled.join(', ')}. Проверьте electronFuses в electron-builder.yml.`);
  process.exit(1);
}
const integrity = wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation] === FuseState.ENABLE ? 'включена' : 'выключена';
console.log(`Fuses в порядке: Node-fuses выключены, проверка целостности app.asar ${integrity}.`);
