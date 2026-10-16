import { createContext, useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { AiMeetingView, AiState } from '../../shared/ai';
import type { ImportProgress } from '../../shared/import';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
import type { SearchResult } from '../../shared/search';
import { isSearchable } from '../../shared/search-text';
import type { Transcript } from '../../shared/transcript';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { cleanDeviceLabel } from './format';
import { catalogErrorsAfter, catalogErrorText, NO_CATALOG_ERRORS } from './model-catalog';
import { nextSpeed } from './playback';

/** Сколько кнопка показывает «Скопировано». */
const COPIED_MS = 2000;

/**
 * «Скопировано» на кнопке копирования: true на 2 с после markCopied(); каждое новое копирование снова показывает
 * «Скопировано» на 2 с.
 */
export function useCopiedFlag(): [boolean, () => void] {
  const [copies, setCopies] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (copies === 0) return;
    setCopied(true);
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copies]);
  const markCopied = useCallback(() => setCopies((n) => n + 1), []);
  return [copied, markCopied];
}

/** Состояние записи из main: сначала запрос, дальше — события. */
export function useRecordingState(): RecordingState | null {
  const [state, setState] = useState<RecordingState | null>(null);
  useEffect(() => {
    let active = true;
    const unsubscribe = window.textmeet.onRecordingState((next) => setState(next));
    window.textmeet
      .getRecordingState()
      .then((initial) => {
        // Событие могло прийти раньше ответа — оно новее.
        if (active) setState((current) => current ?? initial);
      })
      .catch((err: unknown) => console.error('TextMeet: состояние записи не получено', errorText(err)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return state;
}

const SILENT: Peaks = { mic: 0, system: null };

/** Уровни дорожек, пока идёт запись. */
export function usePeaks(active: boolean): Peaks {
  const [peaks, setPeaks] = useState<Peaks>(SILENT);
  useEffect(() => {
    if (!active) {
      setPeaks(SILENT);
      return;
    }
    return window.textmeet.onPeaks(setPeaks);
  }, [active]);
  return peaks;
}

/** Текущее время, обновляется, пока active (таймер записи). */
export function useNow(active: boolean, intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/** Список встреч: при запуске, при изменениях из main и при возврате фокуса (встречи из OneDrive). */
export function useMeetings(): { entries: MeetingListEntry[] | null; error: string | null } {
  const [entries, setEntries] = useState<MeetingListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Перечитывания могут наложиться — показываем только ответ на последний запрос.
  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const list = await window.textmeet.listMeetings();
      if (request !== latestRequest.current) return;
      setEntries(list);
      setError(null);
    } catch (err) {
      if (request === latestRequest.current) setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    const unsubscribe = window.textmeet.onLibraryChanged(() => void reload());
    return () => {
      window.removeEventListener('focus', onFocus);
      unsubscribe();
    };
  }, [reload]);

  return { entries, error };
}

export interface Microphone {
  deviceId: string;
  label: string;
}

/** Микрофоны компьютера (названия видны, потому что main разрешает главному окну проверку «media»). */
export function useMicrophones(): { devices: Microphone[]; defaultLabel: string | null } {
  const [result, setResult] = useState<{ devices: Microphone[]; defaultLabel: string | null }>({
    devices: [],
    defaultLabel: null,
  });
  useEffect(() => {
    let active = true;
    const load = async () => {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const defaultDevice = all.find((d) => d.deviceId === 'default');
      const devices = all
        .filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications')
        .map((d, i) => ({ deviceId: d.deviceId, label: cleanDeviceLabel(d.label) || `Микрофон ${i + 1}` }));
      const defaultLabel = defaultDevice ? cleanDeviceLabel(defaultDevice.label) || null : (devices[0]?.label ?? null);
      if (active) setResult({ devices, defaultLabel });
    };
    const reload = () => void load().catch((err: unknown) => console.error('TextMeet: микрофоны не прочитаны', err));
    reload();
    navigator.mediaDevices.addEventListener('devicechange', reload);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener('devicechange', reload);
    };
  }, []);
  return result;
}

/** Ход расшифровки по встречам: сначала запрос, дальше — события. */
export function useTranscriptionProgress(): ReadonlyMap<string, TranscriptionProgress> {
  const [list, setList] = useState<TranscriptionProgress[]>([]);
  useEffect(() => {
    let active = true;
    let gotEvent = false;
    const unsubscribe = window.textmeet.onTranscriptionProgress((next) => {
      gotEvent = true;
      setList(next);
    });
    window.textmeet
      .getTranscriptionProgress()
      .then((initial) => {
        if (active && !gotEvent) setList(initial);
      })
      .catch((err: unknown) => console.error('TextMeet: ход расшифровки не получен', errorText(err)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return new Map(list.map((p) => [p.meetingId, p]));
}

/** Ход импорта по встречам: сначала запрос, дальше — события. */
export function useImportProgress(): ReadonlyMap<string, ImportProgress> {
  const [list, setList] = useState<ImportProgress[]>([]);
  useEffect(() => {
    let active = true;
    let gotEvent = false;
    const unsubscribe = window.textmeet.onImportProgress((next) => {
      gotEvent = true;
      setList(next);
    });
    window.textmeet
      .getImportProgress()
      .then((initial) => {
        if (active && !gotEvent) setList(initial);
      })
      .catch((err: unknown) => console.error('TextMeet: ход импорта не получен', errorText(err)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return new Map(list.map((p) => [p.meetingId, p]));
}

/**
 * Перетаскивание файлов в окно: true, пока над окном файлы (затемнение); отпустили — пути файлов и имена файлов без
 * пути на диске (из архива, вложение письма). Счётчик входов: над вложенными элементами dragenter и dragleave
 * приходят парами, и затемнение не мигает; уход из окна (relatedTarget нет) и потеря фокуса сбрасывают его, чтобы
 * затемнение не залипло. Перетаскивание текста внутри окна (в нём нет файлов) не трогается.
 */
export function useFileDrop(onFiles: (paths: string[], pathless: string[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(onFiles);
  latest.current = onFiles;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') ?? false;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const reset = () => {
      depth = 0;
      setDragging(false);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = event.relatedTarget === null ? 0 : Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      reset();
      const files = [...(event.dataTransfer?.files ?? [])];
      const pathOf = (file: File): string => {
        try {
          return window.textmeet.pathForFile(file);
        } catch {
          return '';
        }
      };
      if (files.length === 0) return;
      const paths = files.map(pathOf);
      latest.current(
        paths.filter((path) => path !== ''),
        files.filter((_, index) => paths[index] === '').map((file) => file.name),
      );
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('blur', reset);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return dragging;
}

export type TranscriptLoad =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'ready'; transcript: Transcript }
  | { kind: 'error'; message: string };

/**
 * Текст встречи; перечитывается, когда меняется статус или расшифровка начинается и заканчивается (running — есть
 * ход от main). Одного статуса мало: быстрая расшифровка заново может пройти между перечитываниями списка встреч,
 * и окно увидит «готово → готово». Ещё текст перечитывается при возврате в окно — его могли заменить снаружи
 * (другой компьютер через OneDrive). Пока текст перечитывается, показывается прежний (старый текст виден до конца
 * расшифровки заново); пока грузится текст другой встречи, прежний не показывается. set — показать текст, который
 * вернула правка, не перечитывая файл; reload — перечитать сразу (правку отклонили: текст в файле уже другой).
 */
export function useTranscript(
  meetingId: string,
  status: MeetingStatus,
  running: boolean,
): [TranscriptLoad, (transcript: Transcript) => void, () => void] {
  const [state, setState] = useState<{ meetingId: string; load: TranscriptLoad } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const reload = useCallback(() => setReloadCount((n) => n + 1), []);
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);
  // Номер последнего запроса: ответ на более ранний (например, перечитывание при возврате в окно, начатое до
  // правки) не затирает более свежий текст.
  const latest = useRef(0);
  const set = useCallback(
    (transcript: Transcript) => {
      latest.current += 1;
      setState({ meetingId, load: { kind: 'ready', transcript } });
    },
    [meetingId],
  );
  useEffect(() => {
    const request = ++latest.current;
    const done = (load: TranscriptLoad) => {
      if (request !== latest.current) return;
      setState((current) => {
        // Перечитать не вышло (OneDrive ещё пишет файл) — показанный текст и открытая правка остаются.
        // Файла нет совсем (ответ «нет текста») — это не сбой: показывать прежний текст нельзя.
        const shown = current?.meetingId === meetingId && current.load.kind === 'ready';
        return shown && load.kind === 'error' ? current : { meetingId, load };
      });
    };
    window.textmeet
      .getTranscript(meetingId)
      .then((transcript) => done(transcript ? { kind: 'ready', transcript } : { kind: 'none' }))
      .catch((err: unknown) => done({ kind: 'error', message: errorText(err) }));
  }, [meetingId, status, running, reloadCount]);
  return [state?.meetingId === meetingId ? state.load : { kind: 'loading' }, set, reload];
}

/** Плеер встречи: элемент <audio> — у Player, управление — у всей встречи (щелчок по времени реплики). */
export interface Playback {
  /** Ref элемента <audio>: когда элемента нет (запись не готова, не открылась), плеер сбрасывается. */
  ref(element: HTMLAudioElement | null): void;
  playing: boolean;
  /** Место в записи, секунды. */
  position: number;
  duration: number | null;
  speed: number;
  failed: boolean;
  toggle(): void;
  seek(seconds: number): void;
  /** Слушать с этого места. */
  seekAndPlay(seconds: number): void;
  nextSpeed(): void;
  /**
   * Остановить и отпустить файл записи (перед удалением: иначе Windows не даст перенести папку в Корзину).
   * Возвращает «вернуть как было» — если удалить не вышло.
   */
  release(): () => void;
  /** Обработчики событий <audio>. */
  events: {
    onPlay(): void;
    onPause(): void;
    onEnded(): void;
    onTimeUpdate(event: SyntheticEvent<HTMLAudioElement>): void;
    onLoadedMetadata(event: SyntheticEvent<HTMLAudioElement>): void;
    onError(): void;
  };
}

export function usePlayback(meetingId: string, fallbackDuration: number | null): Playback {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | null>(fallbackDuration);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);

  // Другая встреча — плеер с нуля (длительность из meeting.json может уточниться во время игры — это не повод).
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(fallbackDuration);
    setFailed(false);
  }, [meetingId]);

  // Длительность из meeting.json могла прийти после появления плеера, а сам файл её не сообщил.
  useEffect(() => {
    setDuration((current) => current ?? fallbackDuration);
  }, [fallbackDuration]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  // Элемент появился или исчез (Player не показывается, пока запись не готова или не открылась) — играть нечему.
  const ref = useCallback((element: HTMLAudioElement | null) => {
    audio.current = element;
    setPlaying(false);
    setPosition(0);
  }, []);

  // AbortError — воспроизведение прервали (пауза, перемотка, удаление аудио): это не поломка записи.
  const play = useCallback((el: HTMLAudioElement) => {
    void el.play().catch((err: unknown) => {
      if ((err as Error | null)?.name !== 'AbortError') setFailed(true);
    });
  }, []);
  // Постоянная функция: её получает каждая реплика, и новая функция перерисовывала бы весь текст при игре.
  const seekAndPlay = useCallback(
    (seconds: number) => {
      const el = audio.current;
      if (!el) return;
      el.currentTime = seconds;
      setPosition(seconds);
      if (el.paused) play(el);
    },
    [play],
  );

  return {
    ref,
    playing,
    position,
    duration,
    speed,
    failed,
    toggle: () => {
      const el = audio.current;
      if (!el) return;
      if (el.paused) play(el);
      else el.pause();
    },
    seek: (seconds) => {
      const el = audio.current;
      if (el) el.currentTime = seconds;
      setPosition(seconds);
    },
    seekAndPlay,
    nextSpeed: () => setSpeed((s) => nextSpeed(s)),
    release: () => {
      const el = audio.current;
      const src = el?.getAttribute('src');
      if (!el || !src) return () => undefined;
      el.pause();
      el.removeAttribute('src');
      el.load();
      return () => {
        el.setAttribute('src', src);
        el.load();
        // Файл загружен заново — с начала.
        setPlaying(false);
        setPosition(0);
      };
    },
    events: {
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onTimeUpdate: (event) => setPosition(event.currentTarget.currentTime),
      onLoadedMetadata: (event) => {
        if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
        event.currentTarget.playbackRate = speed;
      },
      onError: () => setFailed(true),
    },
  };
}

/** Пауза набора перед поиском. */
const SEARCH_DELAY_MS = 200;

export type SearchState =
  | { kind: 'idle' }
  | { kind: 'searching'; result: SearchResult | null }
  | { kind: 'ready'; result: SearchResult }
  | { kind: 'error'; message: string };

/**
 * Поиск по всем встречам: после паузы набора; показывается только ответ на последний запрос. Повторяется, когда
 * библиотека изменилась, при возврате в окно и когда изменился refreshKey (правка текста: main о ней не
 * сообщает, если meeting.json не менялся) — найденное не устаревает.
 */
export function useSearch(query: string, refreshKey: number): SearchState {
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [again, setAgain] = useState(0);
  const latest = useRef(0);
  const active = isSearchable(query);

  useEffect(() => {
    if (!active) return;
    const bump = () => setAgain((n) => n + 1);
    window.addEventListener('focus', bump);
    const unsubscribe = window.textmeet.onLibraryChanged(bump);
    // Итоги или ответ сохранились — их слова тоже ищутся.
    const unsubscribeAi = window.textmeet.onAiChanged(bump);
    return () => {
      window.removeEventListener('focus', bump);
      unsubscribe();
      unsubscribeAi();
    };
  }, [active]);

  useEffect(() => {
    const request = ++latest.current;
    if (!active) {
      setState({ kind: 'idle' });
      return;
    }
    // Прежний ответ виден, пока идёт новый поиск: без мелькания «Ищем…» и подсветки при каждой набранной букве.
    setState((current) => ({
      kind: 'searching',
      result: current.kind === 'ready' || current.kind === 'searching' ? current.result : null,
    }));
    const timer = setTimeout(() => {
      window.textmeet
        .search(query)
        .then((result) => {
          if (request === latest.current) setState({ kind: 'ready', result });
        })
        .catch((err: unknown) => {
          if (request === latest.current) setState({ kind: 'error', message: errorText(err) });
        });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, active, again, refreshKey]);

  return state;
}

/** Поиск глазами открытой встречи: слова для подсветки и реплика, к которой перешли из найденного. */
export interface SearchView {
  /** Слова запроса; пусто — поиска нет. */
  words: readonly string[];
  /**
   * nonce — каждый переход новый: повторный щелчок по той же реплике снова к ней прокручивает. segmentId null — перешли
   * по названию встречи: она открывается сверху (в том числе уже открытая).
   */
  focus: { meetingId: string; segmentId: string | null; aiKey: string | null; nonce: number } | null;
  /** Текст встречи правили — повторить поиск. */
  refresh(): void;
}

export const SearchViewContext = createContext<SearchView>({ words: [], focus: null, refresh: () => undefined });

export interface ModelCatalog<S> {
  state: S | null;
  /** Ошибка чтения или ответа на нажатие (ответ на нажатие важнее). */
  error: string | null;
  /** Действие с ответом-состоянием («Скачать», «Удалить»…); его ошибку показываем всегда — это ответ на нажатие. */
  run(action: () => Promise<S>): void;
}

/**
 * Каталог моделей в настройках (расшифровки или для итогов): состояние из main, перечитывается по событиям watch
 * (скачивание продвинулось, расшифровка началась…). Запросы могут наложиться и ответить не по порядку — показываем
 * только ответ на последний. load и watch берутся при первом показе.
 */
export function useModelCatalog<S>(load: () => Promise<S>, watch: (reload: () => void) => () => void): ModelCatalog<S> {
  const [state, setState] = useState<S | null>(null);
  const [errors, setErrors] = useState(NO_CATALOG_ERRORS);
  const latestRequest = useRef(0);
  const source = useRef({ load, watch });

  useEffect(() => {
    const reload = () => {
      const request = ++latestRequest.current;
      source.current
        .load()
        .then((next) => {
          if (request !== latestRequest.current) return;
          setState(next);
          setErrors((prev) => catalogErrorsAfter(prev, 'load', null));
        })
        .catch((err: unknown) => {
          if (request === latestRequest.current) setErrors((prev) => catalogErrorsAfter(prev, 'load', errorText(err)));
        });
    };
    reload();
    const unwatch = source.current.watch(reload);
    return () => {
      // Ответы после закрытия настроек не нужны.
      latestRequest.current += 1;
      unwatch();
    };
  }, []);

  const run = useCallback((action: () => Promise<S>) => {
    const request = ++latestRequest.current;
    action().then(
      (next) => {
        setErrors((prev) => catalogErrorsAfter(prev, 'action', null));
        if (request === latestRequest.current) setState(next);
      },
      (err: unknown) => setErrors((prev) => catalogErrorsAfter(prev, 'action', errorText(err))),
    );
  }, []);

  return { state, error: catalogErrorText(errors), run };
}

const NO_AI: AiState = { job: null, finished: null, failures: [] };

/** Работа модели для итогов: что она пишет сейчас (один запрос на всю программу) и последние неудачи по встречам. */
export function useAiState(): AiState {
  const [state, setState] = useState<AiState | null>(null);
  useEffect(() => {
    let active = true;
    const unsubscribe = window.textmeet.onAiState(setState);
    window.textmeet
      .getAiState()
      .then((initial) => {
        // Событие могло прийти раньше ответа — оно новее.
        if (active) setState((current) => current ?? initial);
      })
      .catch((err: unknown) => console.error('TextMeet: состояние итогов не получено', errorText(err)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return state ?? NO_AI;
}

/**
 * Итоги и вопросы встречи (ai.json): при открытии встречи, после записи файла (ai:changed), при возврате в окно и когда
 * меняется текст встречи (textKey) — от него зависит пометка «Текст встречи меняли после итогов». Ошибка чтения — в
 * onError; показанное остаётся.
 */
export function useAiMeeting(
  meetingId: string,
  textKey: unknown,
  onError: (message: string) => void,
): [AiMeetingView | null, (view: AiMeetingView) => void] {
  const [state, setState] = useState<{ meetingId: string; view: AiMeetingView } | null>(null);
  const [again, setAgain] = useState(0);
  const latest = useRef(0);
  const report = useRef(onError);
  report.current = onError;
  useEffect(() => {
    const bump = () => setAgain((n) => n + 1);
    window.addEventListener('focus', bump);
    const unsubscribe = window.textmeet.onAiChanged((id) => {
      if (id === meetingId) bump();
    });
    return () => {
      window.removeEventListener('focus', bump);
      unsubscribe();
    };
  }, [meetingId]);
  useEffect(() => {
    const request = ++latest.current;
    window.textmeet
      .getAi(meetingId)
      .then((view) => {
        if (request === latest.current) setState({ meetingId, view });
      })
      .catch((err: unknown) => {
        if (request === latest.current) report.current(errorText(err));
      });
  }, [meetingId, textKey, again]);
  const set = useCallback(
    (view: AiMeetingView) => {
      latest.current += 1;
      setState({ meetingId, view });
    },
    [meetingId],
  );
  return [state?.meetingId === meetingId ? state.view : null, set];
}
