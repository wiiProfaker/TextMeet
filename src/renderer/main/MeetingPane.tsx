import { useState } from 'react';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { useTranscript, type TranscriptLoad } from './hooks';
import { FolderIcon, WarnIcon } from './icons';
import { Player } from './Player';
import { TranscribeDialog } from './TranscribeDialog';
import { progressView, transcribeActions, type ProgressView } from './transcription-format';
import { TranscriptView } from './TranscriptView';

interface Props {
  entry: MeetingListEntry;
  /** Ход расшифровки этой встречи, если она в очереди или расшифровывается. */
  progress: TranscriptionProgress | null;
  onError(message: string): void;
}

function OpenFolder({ id, onError }: { id: string; onError(message: string): void }) {
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={() => window.textmeet.openMeetingDir(id).catch((err: unknown) => onError(errorText(err)))}
    >
      <FolderIcon />
      Открыть папку встречи
    </button>
  );
}

function ProgressBar({ value, wide }: { value: number; wide?: boolean }) {
  return (
    <div
      className={wide ? 'prog wide' : 'prog'}
      role="progressbar"
      aria-label="Ход расшифровки"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <i style={{ width: `${value}%` }} />
    </div>
  );
}

/** Ход расшифровки вместо текста — у встречи, которая ещё не расшифровывалась. */
function ProgressBlock({ view }: { view: ProgressView }) {
  return (
    <div className="empty-note">
      <b role="status">{view.text}</b>
      {view.value !== null && <ProgressBar value={view.value} wide />}
      {view.note && <span>{view.note}</span>}
    </div>
  );
}

/** Ход расшифровки заново — полосой над прежним текстом: он виден, пока новый не готов. */
function ProgressStrip({ view }: { view: ProgressView }) {
  return (
    <div className="prog-strip">
      <b role="status">{view.text}</b>
      {view.value !== null && <ProgressBar value={view.value} />}
      {view.note && <span>{view.note}</span>}
      <span className="later">Текст заменится, когда новая расшифровка закончится.</span>
    </div>
  );
}

type BusyStatus = 'queued' | 'transcribing';

/** Средняя часть встречи: текст, ход расшифровки или приглашение расшифровать. */
function Body({
  meeting,
  load,
  busy,
  progress,
  onTranscribe,
}: {
  meeting: Meeting;
  load: TranscriptLoad;
  busy: BusyStatus | null;
  progress: TranscriptionProgress | null;
  /** Кнопка «Расшифровать» под «Текста пока нет»; null — её нет (например, она уже в заголовке). */
  onTranscribe: (() => void) | null;
}) {
  const hasAudio = meeting.tracks.length > 0;
  if (load.kind === 'ready') {
    return (
      <>
        {busy && <ProgressStrip view={progressView(busy, progress)} />}
        <TranscriptView transcript={load.transcript} names={meeting.speakerNames} />
      </>
    );
  }
  if (busy) return <ProgressBlock view={progressView(busy, progress)} />;
  if (load.kind === 'error') {
    return (
      <div className="empty-note">
        <b>Не удалось прочитать текст встречи</b>
        <pre className="reason">{load.message}</pre>
      </div>
    );
  }
  if (load.kind === 'loading' || meeting.status === 'error') return <div className="empty-note" />;
  return (
    <div className="empty-note">
      <b>{hasAudio ? 'Запись сохранена' : 'Звука нет'}</b>
      {hasAudio && <span>Текста пока нет.</span>}
      {onTranscribe && (
        <button type="button" className="btn pri" onClick={onTranscribe}>
          Расшифровать
        </button>
      )}
    </div>
  );
}

/** Прочитанная встреча: заголовок, пометки, текст или ход расшифровки, плеер. */
function MeetingView({ entry, progress, onError }: Props & { entry: Extract<MeetingListEntry, { kind: 'ok' }> }) {
  const [dialog, setDialog] = useState(false);
  const { meeting, mixReady, mixFailed } = entry;
  const busy = meeting.status === 'queued' || meeting.status === 'transcribing' ? meeting.status : null;
  const load = useTranscript(meeting.id, meeting.status, busy !== null || progress !== null);
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  const hasAudio = meeting.tracks.length > 0;
  // Текст уже есть (он виден, пока новый не готов) — в окне предупреждаем, что он заменится.
  const hasText = load.kind === 'ready';
  const transcribeError = meeting.status === 'error' && hasAudio;
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  const retry = () =>
    window.textmeet
      .transcribe({ meetingId: meeting.id, participantsHint: meeting.participantsHint, model: null })
      .catch((err: unknown) => onError(errorText(err)));

  return (
    <main className="pane" aria-label="Встреча">
      <header className="head">
        <h1>{meeting.title}</h1>
        <div className="meta">{meta.join(' · ')}</div>
        <div className="acts">
          {actions.header && (
            <button type="button" className="btn" onClick={() => setDialog(true)}>
              {actions.header}
            </button>
          )}
          <OpenFolder id={meeting.id} onError={onError} />
        </div>
      </header>
      {meeting.recovered && meeting.status !== 'error' && (
        <div className="banner" role="status">
          <WarnIcon />
          <div>
            <b>Запись восстановлена после сбоя</b>
            <p>Запись прервалась из-за сбоя. Сохранено всё, что успело записаться.</p>
          </div>
        </div>
      )}
      {meeting.status === 'error' && (
        <div className="banner" role="alert">
          <WarnIcon />
          <div>
            <b>{transcribeError ? 'Ошибка расшифровки' : 'Ошибка'}</b>
            <p>{meeting.errorMessage ?? 'Что-то пошло не так.'}</p>
            {transcribeError && (
              <div className="acts">
                <button type="button" className="btn" onClick={() => void retry()}>
                  Повторить
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <Body
        meeting={meeting}
        load={load}
        busy={busy}
        progress={progress}
        onTranscribe={actions.body ? () => setDialog(true) : null}
      />
      {mixReady ? (
        <Player meetingId={meeting.id} fallbackDuration={meeting.durationSec} />
      ) : (
        hasAudio && (
          <footer className="player pending">
            {mixFailed
              ? 'Не удалось подготовить запись для прослушивания — дорожки лежат в папке встречи.'
              : 'Готовим запись для прослушивания…'}
          </footer>
        )
      )}
      {dialog && (
        <TranscribeDialog
          meetingId={meeting.id}
          again={actions.header === 'Расшифровать заново'}
          replacesText={hasText}
          participantsHint={meeting.participantsHint}
          onClose={() => setDialog(false)}
        />
      )}
    </main>
  );
}

/** Выбранная встреча: создаётся, не прочиталась или прочитана. */
export function MeetingPane({ entry, progress, onError }: Props) {
  if (entry.kind === 'creating') {
    return (
      <main className="pane" aria-label="Встреча">
        <div className="empty-note">
          <b>Встреча создаётся…</b>
          <span>Если это сообщение не исчезает, встреча не успела создаться — папку можно удалить.</span>
          <OpenFolder id={entry.id} onError={onError} />
        </div>
      </main>
    );
  }
  if (entry.kind === 'broken') {
    return (
      <main className="pane" aria-label="Встреча">
        <div className="empty-note">
          <b>Не удалось прочитать встречу</b>
          <span>Папка: {entry.id}</span>
          <pre className="reason">{entry.reason}</pre>
          <OpenFolder id={entry.id} onError={onError} />
        </div>
      </main>
    );
  }
  return <MeetingView entry={entry} progress={progress} onError={onError} />;
}
