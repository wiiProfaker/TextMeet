import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { entryId } from '../../shared/meeting';
import { IDLE_RECORDING_STATE } from '../../shared/recording';
import { isSearchable, queryWords } from '../../shared/search-text';
import { errorText } from './errors';
import {
  SearchViewContext,
  useFileDrop,
  useImportProgress,
  useMeetings,
  useMicrophones,
  useRecordingState,
  useSearch,
  useTranscriptionProgress,
  type SearchView,
} from './hooks';
import { ImportIcon, SettingsIcon } from './icons';
import { NO_IMPORT_NOTES, importNotesText, importOutcome, withCopyFailure, type ImportNotes } from './import-format';
import { LivePane } from './LivePane';
import { MeetingList } from './MeetingList';
import { MeetingPane } from './MeetingPane';
import { RecordPanel } from './RecordPanel';
import { SearchBox } from './SearchBox';
import { SearchResults } from './SearchResults';
import { SettingsPane } from './SettingsPane';
import { StopDialog } from './StopDialog';

type Selection = { kind: 'meeting'; id: string } | { kind: 'settings' } | null;

/** Бросили файлы без пути на диске (из архива, вложение письма). */
const NO_FILE_PATH = 'Не удалось получить путь к файлу — перетащите его из папки или нажмите «Импорт файла».';
/** Причина для файла без пути, брошенного вместе с другими файлами. */
const NO_PATH_REASON = 'у файла нет пути на диске — перетащите его из папки или нажмите «Импорт файла»';

/** Один и тот же пустой список: новый [] перерисовывал бы каждую реплику открытой встречи. */
const NO_WORDS: readonly string[] = [];

export function App() {
  const recording = useRecordingState() ?? IDLE_RECORDING_STATE;
  const latestRecording = useRef(recording);
  latestRecording.current = recording;
  const { entries, error: listError } = useMeetings();
  const microphones = useMicrophones();
  const progress = useTranscriptionProgress();
  const imports = useImportProgress();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<SearchView['focus']>(null);
  const searching = isSearchable(query);
  const [searchStamp, setSearchStamp] = useState(0);
  const refreshSearch = useCallback(() => setSearchStamp((n) => n + 1), []);
  const search = useSearch(query, searchStamp);
  // Подсветка — по запросу, ответ на который уже пришёл (после паузы набора), а не на каждую нажатую букву.
  const searched =
    searching && (search.kind === 'ready' || search.kind === 'searching') ? (search.result?.query ?? '') : '';
  const searchView = useMemo<SearchView>(
    () => ({
      words: searched ? queryWords(searched) : NO_WORDS,
      focus: searching ? focus : null,
      refresh: refreshSearch,
    }),
    [searched, searching, focus, refreshSearch],
  );
  const changeQuery = (next: string) => {
    setQuery(next);
    // Запрос изменился — забыть реплику, к которой переходили: у нового поиска её нет.
    setFocus(null);
  };

  useEffect(() => {
    Promise.all([window.textmeet.getSettings(), window.textmeet.getAppInfo()])
      .then(([s, i]) => {
        setSettings(s);
        setInfo(i);
      })
      .catch((err: unknown) => setError(errorText(err)));
  }, []);

  // Началась запись — показываем её; остановилась — показываем записанную встречу.
  const liveId = recording.phase !== 'idle' ? recording.meetingId : null;
  useEffect(() => {
    if (liveId) setSelection({ kind: 'meeting', id: liveId });
  }, [liveId]);
  // Щелчок по уведомлению «Текст встречи готов» — показать эту встречу.
  useEffect(() => window.textmeet.onShowMeeting((id) => setSelection({ kind: 'meeting', id })), []);
  // Что строка ошибки говорит об импорте — до следующего добавления, когда ничего не добавляется. Звук файла не
  // скопировался уже после того, как встреча появилась (main её убрал): сообщение — к итогу добавления и к прежним
  // таким сообщениям, а если файлы ещё проверяются, эту встречу не открывать.
  const importNotes = useRef<ImportNotes>(NO_IMPORT_NOTES);
  useEffect(
    () =>
      window.textmeet.onImportFailed((failure) => {
        importNotes.current = withCopyFailure(importNotes.current, failure);
        setError(importNotesText(importNotes.current));
      }),
    [],
  );

  /**
   * Добавить файлы: первая новая встреча открывается, неудачи (и файлы без пути — pathless) — строкой ошибки слева.
   * Добавления идут по очереди: файлы, брошенные, пока проверяются прежние, ждут их и не перемешиваются с ними.
   */
  const importChain = useRef<Promise<void>>(Promise.resolve());
  /** Сколько добавлений идёт или ждёт очереди. */
  const importsInFlight = useRef(0);
  const importFiles = useCallback((paths: string[], pathless: string[] = []) => {
    const run = async () => {
      try {
        const added = await window.textmeet.importFiles(paths);
        const noPath = pathless.map((name) => ({ name, reason: NO_PATH_REASON }));
        const result = { ...added, failed: [...added.failed, ...noPath] };
        const { open, notes, message } = importOutcome(result, importNotes.current);
        importNotes.current = notes;
        // Идёт запись, открыто «Запись остановлена» или окно открытой встречи (подтверждение, «Расшифровать заново») —
        // не уводим от них: новая встреча и так видна в списке. «Файл добавлен» (окно StopDialog, data-stop-dialog) от
        // выбора встречи не зависит.
        const { phase, stopDialog } = latestRecording.current;
        const busy =
          phase !== 'idle' ||
          stopDialog?.kind === 'recording' ||
          document.querySelector('[aria-modal="true"]:not([data-stop-dialog])') !== null;
        if (open && !busy) setSelection({ kind: 'meeting', id: open });
        // Отказов нет — ошибку не трогаем: её мог успеть показать неудачный импорт другого файла.
        if (message) setError(message);
      } catch (err) {
        setError(errorText(err));
      } finally {
        importsInFlight.current -= 1;
      }
    };
    // Прежнюю ошибку стираем, только если ничего не добавляется: отказ предыдущего добавления не должен пропасть,
    // едва появившись.
    if (importsInFlight.current === 0) {
      importNotes.current = NO_IMPORT_NOTES;
      setError(null);
    }
    importsInFlight.current += 1;
    // Очередь не встаёт, даже если добавление неожиданно сорвалось.
    importChain.current = importChain.current.then(run).catch((err: unknown) => setError(errorText(err)));
  }, []);
  const dragging = useFileDrop((paths, pathless) => {
    if (paths.length > 0) importFiles(paths, pathless);
    else setError(NO_FILE_PATH);
  });
  const [picking, setPicking] = useState(false);
  // Кнопка занята, только пока открыто окно выбора: добавление идёт в фоне, и его не ждём.
  const pickFiles = () => {
    setPicking(true);
    window.textmeet
      .pickImportFiles()
      .then((paths) => {
        if (paths.length > 0) importFiles(paths);
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setPicking(false));
  };
  // Окно «Запись остановлена» показывает свою встречу. Окно «Файл добавлен» встречу не переключает: импорт идёт в фоне,
  // и человек в это время может работать с другой встречей (первая добавленная открывается, когда файлы проверены).
  const recordingDialogId = recording.stopDialog?.kind === 'recording' ? recording.stopDialog.meetingId : null;
  useEffect(() => {
    if (recordingDialogId) setSelection({ kind: 'meeting', id: recordingDialogId });
  }, [recordingDialogId]);

  const platform = info?.platform ?? 'win32';
  // Клавишу держит другая программа — не показываем её как способ начать и остановить запись.
  const hotkey = settings && !settings.hotkey.busy ? settings.hotkey.label : '';
  const chosenMic = microphones.devices.find((d) => d.deviceId === settings?.settings.microphoneId);
  const micLabel = chosenMic?.label ?? microphones.defaultLabel ?? 'Микрофон, выбранный в системе';
  const selectedId = selection?.kind === 'meeting' ? selection.id : null;
  const selectedEntry = entries?.find((e) => entryId(e) === selectedId) ?? null;

  /**
   * Встречу удалили — выбрать соседнюю: ниже по списку, а если её нет — выше. Пока удаление шло, человек мог выбрать
   * другую встречу — тогда выбор не трогаем.
   */
  const selectNeighbor = (id: string) => {
    const list = entries ?? [];
    const at = list.findIndex((e) => entryId(e) === id);
    const next = list[at + 1] ?? list[at - 1];
    setSelection((current) => {
      if (current?.kind !== 'meeting' || current.id !== id) return current;
      return next && at !== -1 ? { kind: 'meeting', id: entryId(next) } : null;
    });
  };

  let pane;
  if (selection?.kind === 'settings') {
    pane = settings ? <SettingsPane state={settings} info={info} onChange={setSettings} /> : null;
  } else if (selectedId !== null && selectedId === liveId) {
    const title = selectedEntry?.kind === 'ok' ? selectedEntry.meeting.title : 'Новая встреча';
    pane = <LivePane state={recording} title={title} hotkey={hotkey} platform={platform} onError={setError} />;
  } else if (selectedEntry) {
    // key: у другой встречи — своё состояние (открытое окно «Расшифровать заново» к ней не переходит).
    pane = (
      <MeetingPane
        key={entryId(selectedEntry)}
        entry={selectedEntry}
        progress={progress.get(entryId(selectedEntry)) ?? null}
        importing={imports.get(entryId(selectedEntry)) ?? null}
        onError={setError}
        onDeleted={() => selectNeighbor(entryId(selectedEntry))}
      />
    );
  } else {
    pane = (
      <main className="pane" aria-label="Встреча">
        <div className="empty-note">
          <b>Выберите встречу слева или начните запись</b>
          <span>{hotkey ? `${hotkey} начинает и останавливает запись из любой программы.` : ''}</span>
        </div>
      </main>
    );
  }

  return (
    <SearchViewContext.Provider value={searchView}>
      <div className="app">
        <aside className="side" aria-label="Запись и встречи">
          <RecordPanel state={recording} hotkey={hotkey} micLabel={micLabel} onError={setError} />
          {error && (
            <p role="alert" className="problem">
              {error}
            </p>
          )}
          <SearchBox value={query} onChange={changeQuery} />
          {searching ? (
            <SearchResults
              state={search}
              selected={focus ? { meetingId: focus.meetingId, segmentId: focus.segmentId } : null}
              onOpen={(id, segmentId) => {
                setSelection({ kind: 'meeting', id });
                setFocus((prev) => ({ meetingId: id, segmentId, nonce: (prev?.nonce ?? 0) + 1 }));
              }}
            />
          ) : (
            <MeetingList
              entries={entries}
              error={listError}
              recording={recording}
              selectedId={selectedId}
              progress={progress}
              imports={imports}
              onSelect={(id) => setSelection({ kind: 'meeting', id })}
            />
          )}
          <div className="foot">
            <button type="button" className="btn grow" disabled={picking} aria-busy={picking} onClick={pickFiles}>
              <ImportIcon />
              Импорт файла
            </button>
            <button
              type="button"
              className={`btn sq-btn${selection?.kind === 'settings' ? ' on' : ''}`}
              aria-label="Настройки"
              aria-pressed={selection?.kind === 'settings'}
              onClick={() => setSelection({ kind: 'settings' })}
            >
              <SettingsIcon />
            </button>
          </div>
        </aside>
        {pane}
        {recording.stopDialog && <StopDialog data={recording.stopDialog} onError={setError} />}
        {dragging && (
          <div className="shade drop-shade" aria-hidden="true">
            <div className="drop-frame">
              <ImportIcon />
              <b>Отпустите — файлы станут встречами</b>
              <span>Аудио или видео: mp3, m4a, wav, ogg, mp4, mov, mkv… Из видео берётся только звук.</span>
            </div>
          </div>
        )}
      </div>
    </SearchViewContext.Provider>
  );
}
