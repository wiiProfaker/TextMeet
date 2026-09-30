import { useState } from 'react';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { useTranscript } from './hooks';
import { FolderIcon, WarnIcon } from './icons';
import { Player } from './Player';
import { TranscribeDialog } from './TranscribeDialog';
import { barFraction, percent, stageText } from './transcription-format';
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

function ProgressBlock({ progress }: { progress: TranscriptionProgress }) {
  const value = percent(barFraction(progress));
  return (
    <div className="empty-note" role="status">
      <b>{stageText(progress)}</b>
      <div
        className="prog wide"
        role="progressbar"
        aria-label="Ход расшифровки"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <i style={{ width: `${value}%` }} />
      </div>
      <span>{progress.stage === 'queued' ? 'Начнётся, когда закончатся встречи перед ней.' : `${value}%`}</span>
    </div>
  );
}

/** Средняя часть встречи: текст, ход расшифровки или приглашение расшифровать. */
function Body({ meeting, progress, onTranscribe }: { meeting: Meeting; progress: TranscriptionProgress | null; onTranscribe(): void }) {
  const load = useTranscript(meeting.id, meeting.status);
  const busy = meeting.status === 'queued' || meeting.status === 'transcribing';
  const hasAudio = meeting.tracks.length > 0;
  if (busy) {
    return <ProgressBlock progress={progress ?? { meetingId: meeting.id, stage: 'queued', fraction: 0, download: null }} />;
  }
  if (load.kind === 'ready') return <TranscriptView transcript={load.transcript} names={meeting.speakerNames} />;
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
      {hasAudio && (
        <>
          <span>Текста пока нет.</span>
          <button type="button" className="btn pri" onClick={onTranscribe}>
            Расшифровать
          </button>
        </>
      )}
    </div>
  );
}

/** Выбранная встреча: заголовок, пометки, текст или ход расшифровки, плеер. */
export function MeetingPane({ entry, progress, onError }: Props) {
  const [dialog, setDialog] = useState(false);
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

  const { meeting, mixReady, mixFailed } = entry;
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  const hasAudio = meeting.tracks.length > 0;
  const transcribeError = meeting.status === 'error' && hasAudio;
  const canTranscribeAgain = hasAudio && ['done', 'queued', 'transcribing'].includes(meeting.status);
  const retry = () =>
    window.textmeet
      .transcribe({ meetingId: meeting.id, participantsHint: meeting.participantsHint })
      .catch((err: unknown) => onError(errorText(err)));

  return (
    <main className="pane" aria-label="Встреча">
      <header className="head">
        <h1>{meeting.title}</h1>
        <div className="meta">{meta.join(' · ')}</div>
        <div className="acts">
          {canTranscribeAgain && (
            <button type="button" className="btn" onClick={() => setDialog(true)}>
              Расшифровать заново
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
      <Body meeting={meeting} progress={progress} onTranscribe={() => setDialog(true)} />
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
          again={meeting.status !== 'recorded'}
          participantsHint={meeting.participantsHint}
          onClose={() => setDialog(false)}
        />
      )}
    </main>
  );
}
