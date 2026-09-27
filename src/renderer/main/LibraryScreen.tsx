import { useCallback, useEffect, useState } from 'react';
import type { MeetingListEntry } from '../../shared/meeting';
import { errorText } from './errors';
import { formatDuration, formatMeetingDate, statusLabel } from './format';

const entryId = (entry: MeetingListEntry): string => (entry.kind === 'ok' ? entry.meeting.id : entry.id);

export function LibraryScreen() {
  const [entries, setEntries] = useState<MeetingListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEntries(await window.textmeet.listMeetings());
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void reload();
    // Встречи могли прийти через OneDrive, пока окно было в фоне.
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const openFolder = () => {
    window.textmeet.openLibraryDir().catch((err: unknown) => setError(errorText(err)));
  };

  if (entries === null && error === null) return <p className="muted pad">Загрузка…</p>;

  const selected = entries?.find((e) => entryId(e) === selectedId) ?? null;

  return (
    <div className="library">
      <aside className="meeting-list" aria-label="Список встреч">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {entries?.length === 0 && (
          <div className="empty">
            <p>Пока нет встреч.</p>
            <p className="muted">Записи и импортированные файлы появятся здесь.</p>
            <button type="button" onClick={openFolder}>
              Открыть папку библиотеки
            </button>
          </div>
        )}
        <ul>
          {entries?.map((entry) => {
            const id = entryId(entry);
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`meeting-item${entry.kind === 'broken' ? ' broken' : ''}`}
                  aria-current={id === selectedId ? 'true' : undefined}
                  onClick={() => setSelectedId(id)}
                >
                  {entry.kind === 'ok' ? (
                    <>
                      <span className="meeting-title">{entry.meeting.title}</span>
                      <span className="meeting-meta">
                        {formatMeetingDate(entry.meeting.createdAt)} · {formatDuration(entry.meeting.durationSec)} ·{' '}
                        {statusLabel(entry.meeting.status)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="meeting-title">Не удалось прочитать встречу</span>
                      <span className="meeting-meta">Папка {entry.id}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <section className="meeting-detail" aria-label="Встреча">
        {selected === null && <p className="muted">Выберите встречу слева.</p>}
        {selected?.kind === 'ok' && (
          <>
            <h1>{selected.meeting.title}</h1>
            <p className="muted">
              {formatMeetingDate(selected.meeting.createdAt)} · {formatDuration(selected.meeting.durationSec)} ·{' '}
              {statusLabel(selected.meeting.status)}
            </p>
            <p className="muted">Расшифровка появится здесь.</p>
          </>
        )}
        {selected?.kind === 'broken' && (
          <>
            <h1>Не удалось прочитать встречу</h1>
            <p>Папка: {selected.id}</p>
            <pre className="reason">{selected.reason}</pre>
          </>
        )}
      </section>
    </div>
  );
}
