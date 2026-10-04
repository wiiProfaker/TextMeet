import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { speakerLabel, type SpeakerId, type Transcript, type TranscriptSegment } from '../../shared/transcript';
import type { TranscriptEdit } from '../../shared/transcript-edit';
import { errorText } from './errors';
import { ChevronIcon, PlayIcon } from './icons';
import { shouldFollow } from './playback';
import { SegmentText } from './SegmentText';
import { SpeakerChips } from './SpeakerChips';
import { SpeakerMenu, type SpeakerOption } from './SpeakerMenu';
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
  /** Слова поиска — подсвечены в репликах. */
  searchWords: readonly string[];
  /** Реплика, к которой перешли из найденного: прокрутить к ней и обвести. */
  focus: { segmentId: string; nonce: number } | null;
  /** Переименовать спикера во всей встрече; null — сейчас нельзя. */
  onRenameSpeaker: ((speakerId: SpeakerId, name: string | null) => Promise<void>) | null;
  onError(message: string): void;
}

/** Сколько висит «Реплика удалена · Вернуть». */
const UNDO_MS = 10_000;

/** Клавиши, которыми человек листает текст сам. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

interface RowProps {
  segment: TranscriptSegment;
  label: string;
  now: boolean;
  /** Перешли к этой реплике из найденного. */
  found: boolean;
  words: readonly string[];
  onPlayAt: ((seconds: number) => void) | null;
  editing: boolean;
  /** null — реплику не править. */
  setEditing: Dispatch<SetStateAction<string | null>> | null;
  onError(message: string): void;
  onSaveText(segment: TranscriptSegment, text: string): Promise<void>;
  /** Спикеры встречи для меню «Кто говорит». */
  speakers: readonly SpeakerOption[];
  menuOpen: boolean;
  setMenuFor(segmentId: string | null): void;
  onPickSpeaker(segment: TranscriptSegment, speakerId: SpeakerId | 'new'): void;
}

/**
 * Реплика: время (щелчок — слушать с этого места), спикер, текст (щелчок — править). memo: при игре и правке
 * перерисовываются только затронутые реплики — поэтому все обработчики постоянные.
 */
const Row = memo(function Row({
  segment,
  label,
  now,
  found,
  words,
  onPlayAt,
  editing,
  setEditing,
  onSaveText,
  speakers,
  menuOpen,
  setMenuFor,
  onPickSpeaker,
  onError,
}: RowProps) {
  const who = useRef<HTMLButtonElement>(null);
  const time = formatTimestamp(segment.start);
  const tone = speakerTone(segment.speakerId);
  return (
    <div
      className={['row', now && 'now', found && 'found', menuOpen && 'menu-open'].filter(Boolean).join(' ')}
      data-segment={segment.id}
      aria-current={now ? 'true' : undefined}
    >
      {onPlayAt ? (
        <button
          type="button"
          className="t tbtn"
          aria-label={`Слушать с ${time}`}
          onClick={() => onPlayAt(segment.start)}
        >
          <PlayIcon />
          {time}
        </button>
      ) : (
        <span className="t">{time}</span>
      )}
      <div>
        {setEditing ? (
          <div className="who-wrap">
            <button
              ref={who}
              type="button"
              className={`who whob ${tone}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-description="Сменить спикера этой реплики"
              onClick={() => setMenuFor(menuOpen ? null : segment.id)}
            >
              {label}
              <ChevronIcon />
            </button>
            {menuOpen && (
              <SpeakerMenu
                options={speakers}
                current={segment.speakerId}
                onClose={(returnFocus) => {
                  setMenuFor(null);
                  if (returnFocus) who.current?.focus();
                }}
                onPick={(speakerId) => {
                  setMenuFor(null);
                  who.current?.focus();
                  onPickSpeaker(segment, speakerId);
                }}
              />
            )}
          </div>
        ) : (
          <div className={`who ${tone}`}>{label}</div>
        )}
        <SegmentText
          text={segment.text}
          words={words}
          editable={setEditing !== null}
          editing={editing}
          onStartEditing={() => setEditing?.(segment.id)}
          // Только свою правку: пока эта сохранялась, могли начать править другую реплику.
          onStopEditing={() => setEditing?.((current) => (current === segment.id ? null : current))}
          onSave={(text) => onSaveText(segment, text)}
          onLostError={onError}
        />
      </div>
    </div>
  );
});

/** Текст встречи, как на листах 1 и 9 макета: спикеры сверху, реплики «время · кто · что». */
export function TranscriptView({
  transcript,
  names,
  nowIndex,
  playing,
  onPlayAt,
  onEdit,
  searchWords,
  focus,
  onRenameSpeaker,
  onError,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const lastManualScroll = useRef(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Удалённая реплика, которую ещё можно вернуть. */
  const [removed, setRemoved] = useState<TranscriptSegment | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  /** Реплика, у которой открыто меню «Кто говорит». */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const speakers = useMemo(
    () => transcript.speakers.map((s) => ({ id: s.id, label: speakerLabel(s.id, names) })),
    [transcript.speakers, names],
  );
  const nowId = nowIndex >= 0 ? (transcript.segments[nowIndex]?.id ?? null) : null;
  const editing = editingId !== null;
  const foundId = focus?.segmentId ?? null;

  // Перешли из найденного — показать реплику посередине. Реплики выше раскладываются только при прокрутке
  // (content-visibility) и сдвигают её — поэтому ещё раз в следующем кадре.
  useEffect(() => {
    if (!focus) return;
    const show = () => {
      const row = box.current?.querySelector(`[data-segment="${CSS.escape(focus.segmentId)}"]`);
      row?.scrollIntoView({ block: 'center' });
    };
    show();
    const frame = requestAnimationFrame(show);
    lastManualScroll.current = Date.now();
    return () => cancelAnimationFrame(frame);
  }, [focus]);

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

  // Правка стала невозможна (началась расшифровка заново) — поле правки и меню закрываются.
  useEffect(() => {
    if (onEdit) return;
    setEditingId(null);
    setMenuFor(null);
  }, [onEdit]);

  const pickSpeaker = useCallback(
    (segment: TranscriptSegment, speakerId: SpeakerId | 'new') => {
      if (!onEdit || speakerId === segment.speakerId) return;
      onEdit({ kind: 'speaker', segmentId: segment.id, speakerId }).catch((err: unknown) => onError(errorText(err)));
    },
    [onEdit, onError],
  );

  const mergeSpeakers = async (from: SpeakerId, into: SpeakerId) => {
    if (onEdit) await onEdit({ kind: 'merge', from, into });
  };

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
      <SpeakerChips
        speakers={transcript.speakers}
        names={names}
        onRename={onEdit ? onRenameSpeaker : null}
        onMerge={mergeSpeakers}
        onError={onError}
      />
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
            found={segment.id === foundId}
            words={searchWords}
            onPlayAt={onPlayAt}
            editing={segment.id === editingId}
            setEditing={onEdit ? setEditingId : null}
            onSaveText={saveText}
            speakers={speakers}
            menuOpen={segment.id === menuFor}
            setMenuFor={setMenuFor}
            onPickSpeaker={pickSpeaker}
            onError={onError}
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
