import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { speakerLabel, type Transcript, type TranscriptSegment } from '../../shared/transcript';
import type { TranscriptEdit } from '../../shared/transcript-edit';
import { errorText } from './errors';
import { PlayIcon } from './icons';
import { shouldFollow } from './playback';
import { SegmentText } from './SegmentText';
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
  /** Сохранить правку; null — текст сейчас не правится (идёт расшифровка заново). */
  onEdit: ((edit: TranscriptEdit) => Promise<void>) | null;
}

/** Сколько висит «Реплика удалена · Вернуть». */
const UNDO_MS = 10_000;

/** Клавиши, которыми человек листает текст сам. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

interface RowProps {
  segment: TranscriptSegment;
  label: string;
  now: boolean;
  onPlayAt: ((seconds: number) => void) | null;
  editing: boolean;
  /** null — реплику не править. */
  setEditing: ((segmentId: string | null) => void) | null;
  onSaveText(segment: TranscriptSegment, text: string): Promise<void>;
}

/**
 * Реплика: время (щелчок — слушать с этого места), спикер, текст (щелчок — править). memo: при игре и правке
 * перерисовываются только затронутые реплики — поэтому все обработчики постоянные.
 */
const Row = memo(function Row({ segment, label, now, onPlayAt, editing, setEditing, onSaveText }: RowProps) {
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
        <SegmentText
          text={segment.text}
          editable={setEditing !== null}
          editing={editing}
          onStartEditing={() => setEditing?.(segment.id)}
          onStopEditing={() => setEditing?.(null)}
          onSave={(text) => onSaveText(segment, text)}
        />
      </div>
    </div>
  );
});

/** Текст встречи, как на листах 1 и 9 макета: спикеры сверху, реплики «время · кто · что». */
export function TranscriptView({ transcript, names, nowIndex, playing, onPlayAt, onEdit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const lastManualScroll = useRef(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Удалённая реплика, которую ещё можно вернуть. */
  const [removed, setRemoved] = useState<TranscriptSegment | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const nowId = nowIndex >= 0 ? (transcript.segments[nowIndex]?.id ?? null) : null;
  const editing = editingId !== null;

  // Звучит следующая реплика — показать её, если человек не листает текст сам и не правит реплику.
  useEffect(() => {
    if (nowId === null) return;
    if (!shouldFollow({ playing, editing, now: Date.now(), lastManualScroll: lastManualScroll.current })) return;
    const row = box.current?.querySelector(`[data-segment="${CSS.escape(nowId)}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [nowId, playing, editing]);

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  // Правка стала невозможна (началась расшифровка заново) — поле правки закрывается.
  useEffect(() => {
    if (!onEdit) setEditingId(null);
  }, [onEdit]);

  const saveText = useCallback(
    async (segment: TranscriptSegment, text: string) => {
      if (!onEdit) return;
      await onEdit({ kind: 'text', segmentId: segment.id, text });
      if (text.trim() === '') {
        setUndoError(null);
        setRemoved(segment);
      }
    },
    [onEdit],
  );

  const restore = async () => {
    if (!removed || !onEdit) return;
    try {
      await onEdit({ kind: 'restore', segment: removed });
      setRemoved(null);
    } catch (err) {
      setUndoError(errorText(err));
    }
  };

  if (transcript.segments.length === 0 && !removed) {
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
            editing={segment.id === editingId}
            setEditing={onEdit ? setEditingId : null}
            onSaveText={saveText}
          />
        ))}
        {removed && (
          <div className="undo" role="status">
            Реплика {formatTimestamp(removed.start)} удалена
            <button type="button" className="lnk" onClick={() => void restore()}>
              Вернуть
            </button>
            {undoError && <span className="undo-err">{undoError}</span>}
          </div>
        )}
      </div>
    </>
  );
}
