import { useEffect, useRef, useState } from 'react';
import { ME, speakerLabel, type SpeakerId, type TranscriptSpeaker } from '../../shared/transcript';
import { mergeTarget } from '../../shared/transcript-edit';
import { ConfirmDialog } from './ConfirmDialog';
import { errorText } from './errors';
import { PencilIcon } from './icons';
import { speakerTone } from './transcription-format';

interface Props {
  speakers: readonly TranscriptSpeaker[];
  names: Readonly<Record<string, string>>;
  /** В строке под названием встречи («· Спикеры: …»), а не отдельной полосой над текстом. */
  inline?: boolean;
  /** null — спикеров сейчас не переименовать (идёт расшифровка заново). */
  onRename: ((speakerId: SpeakerId, name: string | null) => Promise<void>) | null;
  onMerge(from: SpeakerId, into: SpeakerId): Promise<void>;
  onError(message: string): void;
}

/** Поле имени вместо чипа: Enter или уход из поля — сохранить, Esc — отмена. */
function NameField({
  speakerId,
  initial,
  onDone,
}: {
  speakerId: SpeakerId;
  initial: string;
  /** byKey — закончили клавишей (Enter, Esc): фокус вернуть на чип; уход мышью фокус не трогает. */
  onDone(name: string | null, byKey: boolean): void;
}) {
  const [draft, setDraft] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => field.current?.select(), []);
  const finish = (name: string | null, byKey: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(name, byKey);
  };
  return (
    <label className={`chip edit ${speakerTone(speakerId)}`}>
      <span className="pip" />
      <input
        ref={field}
        aria-label="Имя спикера"
        placeholder={speakerLabel(speakerId)}
        value={draft}
        maxLength={100}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          // Ушли в другую программу (Alt+Tab) — поле остаётся открытым, а не сохраняется на полуслове.
          if (document.hasFocus()) finish(draft, false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(draft, true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            finish(null, true);
          }
        }}
      />
    </label>
  );
}

/**
 * Строка «Спикеры»: щелчок по чипу — переименовать во всей встрече; пустое имя вернёт «Спикер N» / «Я». Имя,
 * которое уже есть у другого спикера, — просьба объединить их (окно подтверждения, лист 11 макета).
 */
export function SpeakerChips({ speakers, names, inline = false, onRename, onMerge, onError }: Props) {
  const [editing, setEditing] = useState<SpeakerId | null>(null);
  const [merge, setMerge] = useState<{ from: SpeakerId; into: SpeakerId } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  /** Чипы-кнопки по спикерам: на них возвращается фокус, когда поле имени закрылось. */
  const chips = useRef(new Map<SpeakerId, HTMLButtonElement>());
  /** Чей чип получит фокус, когда поле имени исчезнет. */
  const refocus = useRef<SpeakerId | null>(null);

  /** Чип спикера; нет такого (его объединили с другим) — первый чип строки. */
  const chipFor = (...ids: SpeakerId[]): HTMLElement | null =>
    ids.map((id) => chips.current.get(id)).find((chip) => chip?.isConnected) ??
    list.current?.querySelector<HTMLElement>('button.chip') ??
    null;

  // Поле имени заменилось чипом — фокус на чип (иначе он падает на <body>, и клавиатура теряет место).
  useEffect(() => {
    if (editing !== null || refocus.current === null) return;
    chipFor(refocus.current)?.focus();
    refocus.current = null;
  }, [editing]);

  const finish = async (speakerId: SpeakerId, name: string | null, byKey: boolean) => {
    setEditing(null);
    if (byKey) refocus.current = speakerId;
    // Esc — без изменений.
    if (name === null || !onRename) return;
    const next = name.trim();
    if (next === (names[speakerId] ?? '')) return;
    const into = mergeTarget(speakers, names, speakerId, next);
    if (into) {
      // Фокус вернёт окно подтверждения, когда закроется.
      refocus.current = null;
      setMerge({ from: speakerId, into });
      return;
    }
    try {
      await onRename(speakerId, next === '' ? null : next);
    } catch (err) {
      onError(errorText(err));
    }
  };

  return (
    <>
      <div ref={list} className={inline ? 'spk inline' : 'spk'} role="list" aria-label="Спикеры">
        <span aria-hidden="true">{inline ? '· Спикеры:' : 'Спикеры'}</span>
        {speakers.map((s) => {
          const label = speakerLabel(s.id, names);
          if (editing === s.id) {
            return (
              <span key={s.id} role="listitem">
                <NameField
                  speakerId={s.id}
                  initial={names[s.id] ?? ''}
                  onDone={(name, byKey) => void finish(s.id, name, byKey)}
                />
              </span>
            );
          }
          // Безымянный собеседник — пунктиром и с карандашом: его стоит назвать.
          const unnamed = s.id !== ME && names[s.id] === undefined;
          return (
            <span key={s.id} role="listitem">
              {onRename ? (
                <button
                  ref={(el) => {
                    if (el) chips.current.set(s.id, el);
                    else chips.current.delete(s.id);
                  }}
                  type="button"
                  className={unnamed ? 'chip un' : 'chip'}
                  aria-description="Переименовать во всей встрече"
                  onClick={() => setEditing(s.id)}
                >
                  <span className={`pip ${speakerTone(s.id)}`} />
                  {label}
                  {unnamed && <PencilIcon />}
                </button>
              ) : (
                <span className="chip">
                  <span className={`pip ${speakerTone(s.id)}`} />
                  {label}
                </span>
              )}
            </span>
          );
        })}
      </div>
      {merge && (
        <ConfirmDialog
          title={`Объединить «${speakerLabel(merge.from, names)}» и «${speakerLabel(merge.into, names)}»?`}
          confirmLabel="Объединить"
          onCancel={() => setMerge(null)}
          restoreFocus={() => chipFor(merge.from, merge.into)}
          onConfirm={async () => {
            await onMerge(merge.from, merge.into);
            setMerge(null);
          }}
        >
          Похоже, это один человек. Все реплики «{speakerLabel(merge.from, names)}» станут репликами «
          {speakerLabel(merge.into, names)}», и в списке останется один спикер.
        </ConfirmDialog>
      )}
    </>
  );
}
