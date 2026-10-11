import { splitByRanges, type TextRange } from '../../shared/search-text';
import type { SearchMeeting } from '../../shared/search';
import { searchFoundText, searchMeetingMeta } from './format';
import type { SearchState } from './hooks';
import { formatTimestamp } from '../../shared/format';
import { speakerTone } from './transcription-format';

/** Текст с подсвеченными совпадениями. */
export function Marked({ text, ranges }: { text: string; ranges: readonly TextRange[] }) {
  return (
    <>{splitByRanges(text, ranges).map((piece, i) => (piece.mark ? <mark key={i}>{piece.text}</mark> : piece.text))}</>
  );
}

interface Props {
  state: SearchState;
  /** Открытая из найденного реплика — выделена. */
  selected: { meetingId: string; segmentId: string | null } | null;
  /** Открыть встречу; segmentId — прокрутить к этой реплике. */
  onOpen(meetingId: string, segmentId: string | null): void;
}

function MeetingHits({ meeting, selected, onOpen }: { meeting: SearchMeeting } & Omit<Props, 'state'>) {
  const more = meeting.total - meeting.hits.length;
  return (
    <div className="rg" role="group" aria-label={meeting.title}>
      <button type="button" className="rg-h" onClick={() => onOpen(meeting.meetingId, null)}>
        <b>
          <Marked text={meeting.title} ranges={meeting.titleRanges} />
        </b>
        <span>{searchMeetingMeta(meeting.createdAt, meeting.total, new Date())}</span>
      </button>
      {meeting.hits.map((hit) => (
        <button
          key={hit.segmentId}
          type="button"
          className="hit"
          aria-current={
            selected?.meetingId === meeting.meetingId && selected.segmentId === hit.segmentId ? 'true' : undefined
          }
          onClick={() => onOpen(meeting.meetingId, hit.segmentId)}
        >
          <span className="ht">{formatTimestamp(hit.start)}</span>
          <span>
            <span className={`hw ${speakerTone(hit.speakerId)}`}>{hit.speaker}</span>
            <Marked text={hit.text} ranges={hit.ranges} />
          </span>
        </button>
      ))}
      {more > 0 && (
        <button type="button" className="more" onClick={() => onOpen(meeting.meetingId, null)}>
          и ещё {more} — откройте встречу
        </button>
      )}
    </div>
  );
}

/** Найденное вместо списка встреч (лист 10 макета): встреча, под ней реплики со временем и подсветкой. */
export function SearchResults({ state, selected, onOpen }: Props) {
  if (state.kind === 'error') {
    return (
      <div className="list">
        <p role="alert" className="err pad">
          {state.message}
        </p>
      </div>
    );
  }
  const result = state.kind === 'ready' || state.kind === 'searching' ? state.result : null;
  if (!result) return <div className="list muted pad">Ищем…</div>;
  return (
    <nav className="list" aria-label="Найдено">
      <div className="found-n" role="status">
        {searchFoundText(result.meetings.length, result.truncated)}
      </div>
      {result.meetings.map((meeting) => (
        <MeetingHits key={meeting.meetingId} meeting={meeting} selected={selected} onOpen={onOpen} />
      ))}
    </nav>
  );
}
