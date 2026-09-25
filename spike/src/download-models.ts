import { MODELS, modelsRoot } from './models.ts';
import { ensureModel } from './download.ts';

console.log(`Папка моделей: ${modelsRoot()}`);
for (const entry of Object.values(MODELS)) {
  console.log(`→ ${entry.id}`);
  await ensureModel(entry);
}
console.log('Все модели на месте.');
