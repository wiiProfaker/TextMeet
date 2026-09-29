import { entryId, type MeetingListEntry } from '../../shared/meeting';
import type { RecordingState } from '../../shared/recording';
import { formatDurationShort } from '../../shared/format';
import { formatClock, formatTimeOfDay, groupByDay, meetingNote, type MeetingNote } from './format';
import { useNow } from './hooks';

interface Props {
  entries: MeetingListEntry[] | null;
  error: string | null;
  recording: RecordingState;
  selectedId: string | null;
  onSelect(id: string): void;
}

function Item({
  entry,
  live,
  elapsed,
  selected,
  onSelect,
}: {
  entry: MeetingListEntry;
  live: boolean;
  elapsed: number;
  selected: boolean;
  onSelect(): void;
}) {
  let title: string;
  let meta: string;
  let note: MeetingNote | null;
  if (entry.kind === 'ok') {
    title = entry.meeting.title;
    meta = live
      ? formatTimeOfDay(entry.meeting.createdAt)
      : `${formatTimeOfDay(entry.meeting.createdAt)} · ${formatDurationShort(entry.meeting.durationSec)}`;
    note = live ? { text: `● идёт запись · ${formatClock(elapsed)}`, tone: 'live' } : meetingNote(entry.meeting);
  } else if (entry.kind === 'creating') {
    title = 'Новая встреча';
    meta = '';
    note = { text: 'создаётся…', tone: 'accent' };
  } else {
    title = 'Не удалось прочитать встречу';
    meta = `папка ${entry.id}`;
    note = null;
  }
  return (
    <button type="button" className="it" aria-current={selected ? 'true' : undefined} onClick={onSelect}>
      <b>{title}</b>
      <span className="meta-line">
        {meta}
        {meta && note ? ' · ' : ''}
        {note && <span className={`tone-${note.tone}`}>{note.text}</span>}
      </span>
    </button>
  );
}

/** Список встреч по дням, новые сверху. */
export function MeetingList({ entries, error, recording, selectedId, onSelect }: Props) {
  const liveId = recording.phase !== 'idle' ? recording.meetingId : null;
  const now = useNow(liveId !== null);
  const elapsed = recording.startedAt === null ? 0 : (now - recording.startedAt) / 1000;

  if (entries === null && error === null) return <div className="list muted pad">Загрузка…</div>;

  return (
    <nav className="list" aria-label="Встречи">
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      {entries?.length === 0 && (
        <p className="empty-list">
          Пока нет встреч. Нажмите «Начать запись» — встреча появится здесь.
        </p>
      )}
      {groupByDay(entries ?? [], new Date()).map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <div className="grp">{group.label}</div>
          {group.entries.map((entry) => {
            const id = entryId(entry);
            return (
              <Item
                key={id}
                entry={entry}
                live={id === liveId}
                elapsed={elapsed}
                selected={id === selectedId}
                onSelect={() => onSelect(id)}
              />
            );
          })}
        </div>
      ))}
    </nav>
  );
}
