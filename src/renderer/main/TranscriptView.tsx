import { memo, useEffect, useRef } from 'react';
import { speakerLabel, type Transcript, type TranscriptSegment } from '../../shared/transcript';
import { PlayIcon } from './icons';
import { shouldFollow } from './playback';
import { formatTimestamp, speakerTone } from './transcription-format';

interface Props {
  transcript: Transcript;
  /** Имена спикеров из meeting.json. */
  names: Readonly<Record<string, string>>;
  /** Звучащая реплика (номер) — подсвечена; -1 — никакая. */
  nowIndex: number;
  /** Запись играет — текст идёт за звуком. */
  playing: boolean;
  /** Слушать с начала реплики; null — запись недоступна (готовится, не свелась, удалена). */
  onPlayAt: ((seconds: number) => void) | null;
}

/** Клавиши, которыми человек листает текст сам. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

interface RowProps {
  segment: TranscriptSegment;
  label: string;
  now: boolean;
  onPlayAt: ((seconds: number) => void) | null;
}

/** Реплика: время (щелчок — слушать с этого места), спикер, текст. memo: при игре меняются только две реплики. */
const Row = memo(function Row({ segment, label, now, onPlayAt }: RowProps) {
  const time = formatTimestamp(segment.start);
  return (
    <div className={now ? 'row now' : 'row'} data-segment={segment.id} aria-current={now ? 'true' : undefined}>
      {onPlayAt ? (
        <button type="button" className="t tbtn" aria-label={`Слушать с ${time}`} onClick={() => onPlayAt(segment.start)}>
          <PlayIcon />
          {time}
        </button>
      ) : (
        <span className="t">{time}</span>
      )}
      <div>
        <div className={`who ${speakerTone(segment.speakerId)}`}>{label}</div>
        <div className="say">{segment.text}</div>
      </div>
    </div>
  );
});

/** Текст встречи, как на листах 1 и 9 макета: спикеры сверху, реплики «время · кто · что». */
export function TranscriptView({ transcript, names, nowIndex, playing, onPlayAt }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const lastManualScroll = useRef(0);
  const nowId = nowIndex >= 0 ? (transcript.segments[nowIndex]?.id ?? null) : null;

  // Звучит следующая реплика — показать её, если человек не листает текст сам.
  useEffect(() => {
    if (nowId === null) return;
    if (!shouldFollow({ playing, editing: false, now: Date.now(), lastManualScroll: lastManualScroll.current })) return;
    const row = box.current?.querySelector(`[data-segment="${CSS.escape(nowId)}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [nowId, playing]);

  if (transcript.segments.length === 0) {
    return (
      <div className="empty-note">
        <b>В записи не найдено речи</b>
        <span>Если речь там есть, попробуйте «Расшифровать заново» и укажите число участников.</span>
      </div>
    );
  }
  const manualScroll = () => {
    lastManualScroll.current = Date.now();
  };
  return (
    <>
      <div className="spk" role="list" aria-label="Спикеры">
        <span aria-hidden="true">Спикеры</span>
        {transcript.speakers.map((s) => (
          <span key={s.id} className="chip" role="listitem">
            <span className={`pip ${speakerTone(s.id)}`} />
            {speakerLabel(s.id, names)}
          </span>
        ))}
      </div>
      <div
        ref={box}
        className="tx"
        role="region"
        aria-label="Текст встречи"
        onWheel={manualScroll}
        onTouchMove={manualScroll}
        onKeyDown={(e) => {
          if (SCROLL_KEYS.has(e.key)) manualScroll();
        }}
        onPointerDown={(e) => {
          // Полоса прокрутки — щелчок по самой области текста.
          if (e.target === e.currentTarget) manualScroll();
        }}
      >
        {transcript.segments.map((segment, i) => (
          <Row
            key={segment.id}
            segment={segment}
            label={speakerLabel(segment.speakerId, names)}
            now={i === nowIndex}
            onPlayAt={onPlayAt}
          />
        ))}
      </div>
    </>
  );
}
