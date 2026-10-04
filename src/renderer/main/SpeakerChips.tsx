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
  onDone(name: string | null): void;
}) {
  const [draft, setDraft] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => field.current?.select(), []);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
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
        onBlur={() => finish(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(draft);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(null);
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
export function SpeakerChips({ speakers, names, onRename, onMerge, onError }: Props) {
  const [editing, setEditing] = useState<SpeakerId | null>(null);
  const [merge, setMerge] = useState<{ from: SpeakerId; into: SpeakerId } | null>(null);

  const finish = async (speakerId: SpeakerId, name: string | null) => {
    setEditing(null);
    // Esc — без изменений.
    if (name === null || !onRename) return;
    const next = name.trim();
    if (next === (names[speakerId] ?? '')) return;
    const into = mergeTarget(speakers, names, speakerId, next);
    if (into) {
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
      <div className="spk" role="list" aria-label="Спикеры">
        <span aria-hidden="true">Спикеры</span>
        {speakers.map((s) => {
          const label = speakerLabel(s.id, names);
          if (editing === s.id) {
            return (
              <span key={s.id} role="listitem">
                <NameField speakerId={s.id} initial={names[s.id] ?? ''} onDone={(name) => void finish(s.id, name)} />
              </span>
            );
          }
          // Безымянный собеседник — пунктиром и с карандашом: его стоит назвать.
          const unnamed = s.id !== ME && names[s.id] === undefined;
          return (
            <span key={s.id} role="listitem">
              {onRename ? (
                <button
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
