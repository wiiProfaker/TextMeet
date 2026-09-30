import { useId } from 'react';
import { CHOICES, type ParticipantsChoice } from './participants';

interface Props {
  value: ParticipantsChoice;
  onChange(next: ParticipantsChoice): void;
}

/** Вопрос «Сколько человек было на встрече, включая вас?» — окно «Запись остановлена» и «Расшифровать заново». */
export function ParticipantsPicker({ value, onChange }: Props) {
  // Своё id у каждого вопроса: окно «Запись остановлена» может открыться поверх «Расшифровать заново».
  const questionId = useId();
  return (
    <>
      <div className="q" id={questionId}>
        Сколько человек было на встрече, включая вас?
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
