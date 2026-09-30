import { memo } from 'react';
import { speakerLabel, type Transcript } from '../../shared/transcript';
import { formatTimestamp, speakerTone } from './transcription-format';

interface Props {
  transcript: Transcript;
  /** Имена спикеров из meeting.json (переименование — План 4). */
  names: Readonly<Record<string, string>>;
}

/**
 * Текст встречи, как на листе 1 макета: спикеры сверху, реплики «время · кто · что». Только чтение (План 3).
 * memo: ход расшифровки заново обновляет встречу каждую секунду, а текст при этом прежний (те же объекты).
 */
export const TranscriptView = memo(function TranscriptView({ transcript, names }: Props) {
  if (transcript.segments.length === 0) {
    return (
      <div className="empty-note">
        <b>В записи не найдено речи</b>
        <span>Если речь там есть, попробуйте «Расшифровать заново» и укажите число участников.</span>
      </div>
    );
  }
  return (
    <>
      <div className="spk" aria-label="Спикеры">
        <span>Спикеры</span>
        {transcript.speakers.map((s) => (
          <span key={s.id} className="chip">
            <span className={`pip ${speakerTone(s.id)}`} />
            {speakerLabel(s.id, names)}
          </span>
        ))}
      </div>
      <div className="tx" aria-label="Текст встречи">
        {transcript.segments.map((segment) => (
          <div key={segment.id} className="row">
            <span className="t">{formatTimestamp(segment.start)}</span>
            <div>
              <div className={`who ${speakerTone(segment.speakerId)}`}>{speakerLabel(segment.speakerId, names)}</div>
              <div className="say">{segment.text}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
});
