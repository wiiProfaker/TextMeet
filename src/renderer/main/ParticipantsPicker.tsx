import { useId } from 'react';
import { CHOICES, type ParticipantsChoice } from './participants';

/** Вопрос о встрече, записанной программой: на дорожке микрофона — вы. */
export const RECORDING_QUESTION = 'Сколько человек было на встрече, включая вас?';
/** Вопрос о встрече из файла: «Я» не выделяется, считаются все голоса записи. */
export const FILE_QUESTION = 'Сколько человек говорит на записи?';

interface Props {
  value: ParticipantsChoice;
  onChange(next: ParticipantsChoice): void;
  question?: string;
}

/** Вопрос о числе людей — окна «Запись остановлена», «Файл добавлен» и «Расшифровать заново». */
export function ParticipantsPicker({ value, onChange, question = RECORDING_QUESTION }: Props) {
  // Своё id у каждого вопроса: окно «Запись остановлена» может открыться поверх «Расшифровать заново».
  const questionId = useId();
  return (
    <>
      <div className="q" id={questionId}>
        {question}
      </div>
      <div className="nums" role="group" aria-labelledby={questionId}>
        {CHOICES.map((n) => (
          <button
            key={n}
            type="button"
            className="num"
            aria-pressed={value.choice === n && value.other === ''}
            onClick={() => onChange({ choice: n, other: '' })}
          >
            {n}
          </button>
        ))}
        <input
          className="other"
          inputMode="numeric"
          placeholder="другое"
          aria-label="Другое число участников"
          value={value.other}
          onChange={(e) => onChange({ choice: value.choice, other: e.currentTarget.value })}
        />
      </div>
    </>
  );
}
