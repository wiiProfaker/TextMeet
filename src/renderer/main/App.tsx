import { useEffect, useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { entryId } from '../../shared/meeting';
import { IDLE_RECORDING_STATE } from '../../shared/recording';
import { errorText } from './errors';
import { useMeetings, useMicrophones, useRecordingState } from './hooks';
import { SettingsIcon } from './icons';
import { LivePane } from './LivePane';
import { MeetingList } from './MeetingList';
import { MeetingPane } from './MeetingPane';
import { RecordPanel } from './RecordPanel';
import { SettingsPane } from './SettingsPane';
import { StopDialog } from './StopDialog';

type Selection = { kind: 'meeting'; id: string } | { kind: 'settings' } | null;

export function App() {
  const recording = useRecordingState() ?? IDLE_RECORDING_STATE;
  const { entries, error: listError } = useMeetings();
  const microphones = useMicrophones();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);

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
  const dialogId = recording.stopDialog?.meetingId ?? null;
  useEffect(() => {
    if (dialogId) setSelection({ kind: 'meeting', id: dialogId });
  }, [dialogId]);

  const platform = info?.platform ?? 'win32';
  // Клавишу держит другая программа — не показываем её как способ начать и остановить запись.
  const hotkey = settings && !settings.hotkey.busy ? settings.hotkey.label : '';
  const chosenMic = microphones.devices.find((d) => d.deviceId === settings?.settings.microphoneId);
  const micLabel = chosenMic?.label ?? microphones.defaultLabel ?? 'Микрофон, выбранный в системе';
  const selectedId = selection?.kind === 'meeting' ? selection.id : null;
  const selectedEntry = entries?.find((e) => entryId(e) === selectedId) ?? null;

  let pane;
  if (selection?.kind === 'settings') {
    pane = settings ? <SettingsPane state={settings} info={info} onChange={setSettings} /> : null;
  } else if (selectedId !== null && selectedId === liveId) {
    const title = selectedEntry?.kind === 'ok' ? selectedEntry.meeting.title : 'Новая встреча';
    pane = <LivePane state={recording} title={title} hotkey={hotkey} platform={platform} onError={setError} />;
  } else if (selectedEntry) {
    pane = <MeetingPane entry={selectedEntry} onError={setError} />;
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
    <div className="app">
      <aside className="side" aria-label="Запись и встречи">
        <RecordPanel state={recording} hotkey={hotkey} micLabel={micLabel} onError={setError} />
        {error && (
          <p role="alert" className="problem">
            {error}
          </p>
        )}
        <MeetingList
          entries={entries}
          error={listError}
          recording={recording}
          selectedId={selectedId}
          onSelect={(id) => setSelection({ kind: 'meeting', id })}
        />
        <div className="foot">
          <button
            type="button"
            className="btn grow"
            onClick={() => window.textmeet.openLibraryDir().catch((err: unknown) => setError(errorText(err)))}
          >
            Открыть папку библиотеки
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
    </div>
  );
}
