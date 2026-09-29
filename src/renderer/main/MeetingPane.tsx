import { formatDurationShort } from '../../shared/format';
import type { MeetingListEntry } from '../../shared/meeting';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { FolderIcon, WarnIcon } from './icons';
import { Player } from './Player';

interface Props {
  entry: MeetingListEntry;
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

/** Выбранная встреча: заголовок, пометки, плеер. Текст встречи появится с расшифровкой (План 3). */
export function MeetingPane({ entry, onError }: Props) {
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

  const { meeting, mixReady } = entry;
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  const hasAudio = meeting.tracks.length > 0;

  return (
    <main className="pane" aria-label="Встреча">
      <header className="head">
        <h1>{meeting.title}</h1>
        <div className="meta">{meta.join(' · ')}</div>
        <div className="acts">
          <OpenFolder id={meeting.id} onError={onError} />
        </div>
      </header>
      {meeting.recovered && meeting.status !== 'error' && (
        <div className="banner" role="status">
          <WarnIcon />
          <div>
            <b>Запись восстановлена после сбоя</b>
            <p>Программа закрылась во время записи. Сохранено всё, что успело записаться.</p>
          </div>
        </div>
      )}
      {meeting.status === 'error' && (
        <div className="banner" role="alert">
          <WarnIcon />
          <div>
            <b>Ошибка</b>
            <p>{meeting.errorMessage ?? 'Что-то пошло не так.'}</p>
          </div>
        </div>
      )}
      <div className="empty-note">
        <b>{hasAudio ? 'Запись сохранена' : 'Звука нет'}</b>
        <span>Текст встречи появится здесь, когда в TextMeet добавится расшифровка.</span>
      </div>
      {mixReady ? (
        <Player meetingId={meeting.id} fallbackDuration={meeting.durationSec} />
      ) : (
        hasAudio && <footer className="player pending">Готовим запись для прослушивания…</footer>
      )}
    </main>
  );
}
