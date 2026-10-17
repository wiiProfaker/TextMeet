import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { speakerLabel, type SpeakerId, type Transcript, type TranscriptSegment } from '../../shared/transcript';
import { editTexts, type TranscriptEdit } from '../../shared/transcript-edit';
import { errorText } from './errors';
import { ChevronIcon, PlayIcon } from './icons';
import { isManualScrollKey, shouldFollow } from './playback';
import { SegmentText } from './SegmentText';
import { SpeakerChips } from './SpeakerChips';
import { SpeakerSlotContext } from './speaker-slot';
import { SpeakerMenu, type SpeakerOption } from './SpeakerMenu';
import { formatTimestamp } from '../../shared/format';
import { speakerTone } from './transcription-format';

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
  /** Куда перешли из найденного: к реплике (прокрутить и обвести) или по названию встречи (в начало текста). */
  focus: { segmentId: string | null; nonce: number } | null;
  /** Переименовать спикера во всей встрече; null — сейчас нельзя. */
  onRenameSpeaker: ((speakerId: SpeakerId, name: string | null) => Promise<void>) | null;
  onError(message: string): void;
}

/** Сколько висит «Реплика удалена · Вернуть». */
const UNDO_MS = 10_000;

/** Правка недоступна, пока идёт расшифровка заново (окно успело показать правку до того, как она началась). */
const EDIT_UNAVAILABLE = 'Идёт расшифровка заново — пока текст не правится. Дождитесь её окончания.';

/** Клавиши, которыми человек листает текст сам. */

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
          data-time
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
  const undoButton = useRef<HTMLButtonElement>(null);
  /** Реплику только что удалили правкой: фокус, упавший вместе с ней, переходит на «Вернуть». */
  const focusUndo = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Удалённые реплики, которые ещё можно вернуть; последняя удалённая — в конце. */
  const [removed, setRemoved] = useState<readonly TranscriptSegment[]>([]);
  const removedRef = useRef(removed);
  removedRef.current = removed;
  const [undoError, setUndoError] = useState<string | null>(null);
  /** Реплика, у которой открыто меню «Кто говорит». */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const speakerSlot = useContext(SpeakerSlotContext);
  const speakers = useMemo(
    () => transcript.speakers.map((s) => ({ id: s.id, label: speakerLabel(s.id, names) })),
    [transcript.speakers, names],
  );
  const nowId = nowIndex >= 0 ? (transcript.segments[nowIndex]?.id ?? null) : null;
  const editing = editingId !== null;
  const foundId = focus?.segmentId ?? null;

  // Перешли из найденного — показать реплику посередине. Реплики выше раскладываются только при прокрутке
  // (content-visibility) и сдвигают её — поэтому ещё раз в следующем кадре. По названию — в начало текста.
  useEffect(() => {
    if (!focus) return;
    const segmentId = focus.segmentId;
    if (segmentId === null) {
      box.current?.scrollTo({ top: 0 });
      lastManualScroll.current = Date.now();
      return;
    }
    const show = () => {
      const row = box.current?.querySelector(`[data-segment="${CSS.escape(segmentId)}"]`);
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

  // Таймер начинается заново при каждом удалении и возврате; не вернулось (ошибка) — плашка висит с ошибкой.
  useEffect(() => {
    if (removed.length === 0 || undoError !== null) return;
    const timer = setTimeout(() => setRemoved([]), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed, undoError]);

  useEffect(() => {
    if (!focusUndo.current) return;
    focusUndo.current = false;
    // Фокус ушёл в другое место (человек щёлкнул в другую реплику) — его не отбираем.
    const active = document.activeElement;
    if (!active || active === document.body) undoButton.current?.focus();
  }, [removed]);

  // Правка стала невозможна (началась расшифровка заново) — поле правки и меню закрываются, «Вернуть» пропадает:
  // реплика старого текста не должна попасть в новый.
  useEffect(() => {
    if (onEdit) return;
    setEditingId(null);
    setMenuFor(null);
    setRemoved([]);
    setUndoError(null);
  }, [onEdit]);

  // Текст заменили целиком (расшифровали заново, на другом компьютере) — открытая правка и «Вернуть» относились к
  // старому тексту; id реплик позиционные, и они попали бы в чужую реплику. Сообщение — в общую плашку: поле правки
  // с его собственной ошибкой закрывается вместе со старым текстом.
  const version = transcript.createdAt;
  const shownVersion = useRef(version);
  const somethingOpen = useRef(false);
  somethingOpen.current = editingId !== null || removed.length > 0 || undoError !== null;
  useEffect(() => {
    if (shownVersion.current === version) return;
    shownVersion.current = version;
    if (somethingOpen.current) onError(editTexts.transcriptChanged);
    setEditingId(null);
    setMenuFor(null);
    setRemoved([]);
    setUndoError(null);
  }, [version, onError]);

  const pickSpeaker = useCallback(
    (segment: TranscriptSegment, speakerId: SpeakerId | 'new') => {
      if (!onEdit || speakerId === segment.speakerId) return;
      // Спикеры удалённых реплик, которые ещё можно «Вернуть», новому собеседнику свои номера не отдают.
      const reserved = [...new Set(removedRef.current.map((s) => s.speakerId))];
      onEdit({ kind: 'speaker', segmentId: segment.id, speakerId, ...(speakerId === 'new' && { reserved }) }).catch(
        (err: unknown) => onError(errorText(err)),
      );
    },
    [onEdit, onError],
  );

  const mergeSpeakers = async (from: SpeakerId, into: SpeakerId) => {
    if (!onEdit) throw new Error(EDIT_UNAVAILABLE);
    await onEdit({ kind: 'merge', from, into });
  };

  const saveText = useCallback(
    async (segment: TranscriptSegment, text: string) => {
      if (!onEdit) throw new Error(EDIT_UNAVAILABLE);
      await onEdit({ kind: 'text', segmentId: segment.id, text });
      if (text.trim() === '') {
        setUndoError(null);
        focusUndo.current = true;
        setRemoved((list) => [...list, segment]);
      }
    },
    [onEdit],
  );

  const lastRemoved = removed.at(-1) ?? null;
  const restore = async () => {
    if (!lastRemoved) return;
    if (!onEdit) {
      setUndoError(EDIT_UNAVAILABLE);
      return;
    }
    try {
      await onEdit({ kind: 'restore', segment: lastRemoved });
      setUndoError(null);
      // Пока возвращалась эта реплика, могли удалить ещё одну — убираем именно возвращённую.
      setRemoved((list) => list.filter((s) => s.id !== lastRemoved.id));
    } catch (err) {
      setUndoError(errorText(err));
    }
  };

  if (transcript.segments.length === 0 && !lastRemoved) {
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
  // Спикеры — в строке под названием встречи, если шапка дала для них место.
  const chips = (inline: boolean) => (
    <SpeakerChips
      speakers={transcript.speakers}
      names={names}
      inline={inline}
      onRename={onEdit ? onRenameSpeaker : null}
      onMerge={mergeSpeakers}
      onError={onError}
    />
  );
  return (
    <>
      {speakerSlot ? createPortal(chips(true), speakerSlot) : chips(false)}
      <div
        ref={box}
        className="tx"
        role="region"
        aria-label="Текст встречи"
        onWheel={manualScroll}
        onTouchMove={manualScroll}
        onKeyDown={(e) => {
          const target = e.target as HTMLElement;
          const on = target.closest('input, textarea')
            ? 'field'
            : target.closest('[data-time]')
              ? 'time'
              : target.closest('button, [role="button"]')
                ? 'button'
                : 'other';
          if (isManualScrollKey(e.key, on)) manualScroll();
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
        {/* Всегда на месте и пустая, пока нечего возвращать: читалка объявляет текст, когда он появился. */}
        <div className="undo-live" role="status">
          {lastRemoved && (
            <div className="undo">
              Реплика {formatTimestamp(lastRemoved.start)} удалена
              <button ref={undoButton} type="button" className="lnk" onClick={() => void restore()}>
                Вернуть
              </button>
              {undoError && (
                <>
                  <span className="undo-err">{undoError}</span>
                  <button
                    type="button"
                    className="lnk"
                    aria-label="Закрыть сообщение об ошибке"
                    onClick={() => {
                      setRemoved([]);
                      setUndoError(null);
                    }}
                  >
                    Закрыть
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
