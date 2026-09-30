import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
import type { Transcript } from '../../shared/transcript';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { cleanDeviceLabel } from './format';

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

export type TranscriptLoad =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'ready'; transcript: Transcript }
  | { kind: 'error'; message: string };

/**
 * Текст встречи; перечитывается, когда меняется статус (например, расшифровка закончилась).
 * Пока грузится текст другой встречи, прежний не показывается.
 */
export function useTranscript(meetingId: string, status: MeetingStatus): TranscriptLoad {
  const [state, setState] = useState<{ meetingId: string; load: TranscriptLoad } | null>(null);
  useEffect(() => {
    let active = true;
    const done = (load: TranscriptLoad) => {
      if (active) setState({ meetingId, load });
    };
    window.textmeet
      .getTranscript(meetingId)
      .then((transcript) => done(transcript ? { kind: 'ready', transcript } : { kind: 'none' }))
      .catch((err: unknown) => done({ kind: 'error', message: errorText(err) }));
    return () => {
      active = false;
    };
  }, [meetingId, status]);
  return state?.meetingId === meetingId ? state.load : { kind: 'loading' };
}
