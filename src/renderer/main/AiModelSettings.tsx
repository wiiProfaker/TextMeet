import { llmModel, type AiModelsState, type LlmModelId } from '../../shared/llm-models';
import { aiCatalogSections, aiDownloadText, aiModelState, aiModelTag, aiSizeText } from './ai-catalog';
import { CatalogCard } from './CatalogCard';
import { useModelCatalog } from './hooks';
import { downloadButton } from './model-catalog';

interface CardProps {
  id: LlmModelId;
  state: AiModelsState;
  run(action: () => Promise<AiModelsState>): void;
}

/** Карточка модели для итогов (решения Плана 9, §2.1). */
function AiModelCard({ id, state, run }: CardProps) {
  const info = llmModel(id);
  const groupState = aiModelState(state, id);
  const download = state.download?.id === id ? state.download : null;
  const failed = state.downloadError?.id === id;
  return (
    <CatalogCard
      title={info.title}
      author={info.author}
      tag={aiModelTag(id)}
      bars={[
        { label: 'качество', value: info.quality },
        { label: 'скорость', value: info.speed },
      ]}
      description={info.description}
      warning={info.warning}
      languages={info.languages}
      sizeText={aiSizeText(groupState)}
      installed={groupState.installed}
      selected={state.selected === id}
      download={download && { text: aiDownloadText(download), fraction: download.total > 0 ? download.done / download.total : 0 }}
      error={failed ? (state.downloadError?.message ?? null) : null}
      downloadButton={downloadButton(info.title, failed)}
      otherDownload={state.download !== null && !download}
      deleteDisabled={state.busy || state.download !== null}
      note={null}
      onSelect={() => run(() => window.textmeet.selectAiModel(id))}
      onDownload={() => run(() => window.textmeet.downloadAiModel(id))}
      onCancel={() => run(() => window.textmeet.cancelAiModelDownload(id))}
      onDelete={() => run(() => window.textmeet.deleteAiModel(id))}
    />
  );
}

/** Перечитывать каталог: скачивание продвинулось, модель начала или закончила отвечать (удалять её нельзя). */
function watchAiModels(reload: () => void): () => void {
  const unsubscribeModels = window.textmeet.onModelsChanged(reload);
  let busy: boolean | null = null;
  const unsubscribeAi = window.textmeet.onAiState((state) => {
    const nowBusy = state.job !== null;
    if (nowBusy !== busy) reload();
    busy = nowBusy;
  });
  return () => {
    unsubscribeModels();
    unsubscribeAi();
  };
}

/** Вкладка «ИИ» → «Модель для итогов»: каталог, как во вкладке «Расшифровка». */
export function AiModelSettings() {
  const { state, error, run } = useModelCatalog<AiModelsState>(() => window.textmeet.getAiModels(), watchAiModels);
  const sections = state && aiCatalogSections(state);
  const group = (title: string, ids: LlmModelId[]) =>
    state &&
    ids.length > 0 && (
      <div className="mgroup" role="group" aria-label={title}>
        <h3>{title}</h3>
        {ids.map((id) => (
          <AiModelCard key={id} id={id} state={state} run={run} />
        ))}
      </div>
    );

  return (
    <div className="fld">
      <div className="lb">Модель для итогов</div>
      <div className="ctl">
        {error && (
          <p role="alert" className="err">
            {error}
          </p>
        )}
        {sections && (
          <div className="catalog">
            {group('Выбрана', sections.selected ? [sections.selected] : [])}
            {group('Скачанные', sections.downloaded)}
            {group('Можно скачать', sections.available)}
          </div>
        )}
        <small>
          Модели работают без интернета, на видеокарте. «Оценка» — эти модели мы не замеряли: полоски примерные. Пока
          скачивается одна модель, другие ждут.
        </small>
      </div>
    </div>
  );
}
