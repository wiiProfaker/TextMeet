import { errorText } from './errors';
import { useCopiedFlag } from './hooks';
import { CheckIcon, CopyIcon } from './icons';

interface Props {
  meetingId: string;
  onError(message: string): void;
}

/** «Скопировать для ИИ» в заголовке встречи (решения Плана 6, §2.1): запрос из настроек и текст встречи. */
export function CopyForAiButton({ meetingId, onError }: Props) {
  const [copied, markCopied] = useCopiedFlag();

  const copy = () => {
    window.textmeet
      .copyForAi(meetingId)
      .then(markCopied)
      .catch((err: unknown) => onError(errorText(err)));
  };

  return (
    <>
      <button type="button" className="btn" onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? 'Скопировано' : 'Скопировать для ИИ'}
      </button>
      {/* Экранному диктору — отдельно от названия кнопки. */}
      <span className="sr-only" role="status">
        {copied ? 'Текст встречи с запросом скопирован' : ''}
      </span>
    </>
  );
}
