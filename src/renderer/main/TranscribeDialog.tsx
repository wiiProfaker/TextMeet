import { useEffect, useId, useRef, useState } from 'react';
import { ASR_MODEL_IDS, isAsrModelId, type AsrModelId } from '../../shared/asr-models';
import type { ModelsState } from '../../shared/transcription';
import { errorText } from './errors';
import { keepFocusInside } from './focus';
import { ChevronIcon, WarnIcon } from './icons';
import { modelChoiceLabel } from './model-catalog';
import { choiceFor, readChoice } from './participants';
import { FILE_QUESTION, ParticipantsPicker } from './ParticipantsPicker';

interface Props {
  meetingId: string;
  /** «Расшифровать заново»: текст уже есть или встреча в очереди/в работе (её работа начнётся заново). */
  again: boolean;
  /** Текст уже есть: он заменится, когда новая расшифровка закончится. */
  replacesText: boolean;
  /** Текст правили руками или собеседникам дали имена — это пропадёт. */
  losesEdits: boolean;
  /** Число участников, указанное раньше (выбрано заранее). */
  participantsHint: number | null;
  /** Встреча из файла: спрашиваем, сколько человек говорит на записи («Я» не выделяется). */
  fromFile: boolean;
  onClose(): void;
}

/** «Расшифровать» / «Расшифровать заново»: модель (по умолчанию — из настроек), число участников и запуск. */
export function TranscribeDialog({
  meetingId,
  again,
  replacesText,
  losesEdits,
  participantsHint,
  fromFile,
  onClose,
}: Props) {
  const [participants, setParticipants] = useState(() => choiceFor(participantsHint));
  const [models, setModels] = useState<ModelsState | null>(null);
  /** null — пока не выбрали сами: модель из настроек. */
  const [model, setModel] = useState<AsrModelId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // Окно закрылось — фокус возвращается на кнопку, которая его открыла.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    // Список моделей не пришёл — окно работает и без него: расшифровка пойдёт моделью из настроек.
    window.textmeet
      .getModels()
      .then((state) => {
        if (active) setModels(state);
      })
      .catch((err: unknown) => console.error('TextMeet: список моделей не получен', errorText(err)));
    return () => {
      active = false;
    };
  }, []);

  const confirm = async () => {
    const n = readChoice(participants);
    if (n === 'invalid') {
      setError('Введите число от 1 до 50.');
      return;
    }
    setSaving(true);
    try {
      await window.textmeet.transcribe({ meetingId, participantsHint: n, model });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  const title = again ? 'Расшифровать заново' : 'Расшифровать';
  return (
    <div className="shade">
      <div
        ref={dialog}
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !saving) onClose();
          if (e.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, e);
        }}
      >
        <h2 id={titleId}>{title}</h2>
        {replacesText && <div className="meta">Текст заменится, когда новая расшифровка закончится.</div>}
        {losesEdits && (
          <p className="wrn">
            <WarnIcon />
            <span>Текст расшифруется с нуля: ваши правки и имена собеседников пропадут.</span>
          </p>
        )}
        {models && (
          <div className="dlg-field">
            <div className="q">Модель</div>
            <span className="selw">
              <select
                aria-label="Модель расшифровки"
                value={model ?? models.selected}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  if (isAsrModelId(next)) setModel(next);
                }}
              >
                {ASR_MODEL_IDS.map((id) => (
                  <option key={id} value={id}>
                    {modelChoiceLabel(models, id)}
                  </option>
                ))}
              </select>
              <ChevronIcon />
            </span>
          </div>
        )}
        <ParticipantsPicker
          question={fromFile ? FILE_QUESTION : undefined}
          value={participants}
          onChange={(next) => {
            setParticipants(next);
            setError(null);
          }}
        />
        <p className="note">Если не выбрать, программа определит число собеседников сама.</p>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-foot">
          <button type="button" className="btn ghost" disabled={saving} onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn pri" disabled={saving} onClick={() => void confirm()}>
            Расшифровать
          </button>
        </div>
      </div>
    </div>
  );
}
