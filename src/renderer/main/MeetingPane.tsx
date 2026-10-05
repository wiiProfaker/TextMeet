import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle, type SpeakerId } from '../../shared/transcript';
import { hasManualChanges, isStaleEditMessage, type TranscriptEdit } from '../../shared/transcript-edit';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { MeetingTitle } from './MeetingTitle';
import { Player } from './Player';
import { segmentAt } from './playback';
import { ConfirmDialog } from './ConfirmDialog';
import { MeetingMenu } from './MeetingMenu';
import { TranscribeDialog } from './TranscribeDialog';
import { progressView, transcribeActions, type ProgressView } from './transcription-format';
import { TranscriptView } from './TranscriptView';

interface Props {
  entry: MeetingListEntry;
  /** Ход расшифровки этой встречи, если она в очереди или расшифровывается. */
  progress: TranscriptionProgress | null;
  onError(message: string): void;
  /** Встречу удалили — выбрать соседнюю. */
  onDeleted(): void;
}

const AUDIO_BUSY = 'Аудио нельзя удалить, пока встреча ждёт расшифровки или расшифровывается.';
const NO_TEXT_TO_EDIT = 'Текст встречи ещё не открыт — правка не сохранена.';
const AUDIO_MIXING = 'Запись ещё готовится к прослушиванию — удалите аудио чуть позже.';

function OpenFolder({ id, onError }: { id: string; onError(message: string): void }) {
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={() => window.textmeet.openMeetingDir(id).catch((err: unknown) => onError(errorText(err)))}
    >
      <FolderIcon />
      Открыть папку встречи
    </button>
  );
}

/** Папку встречи, которая создаётся слишком долго или не читается, тоже можно убрать — в Корзину. */
function DeleteFolder({ id, onDeleted }: { id: string; onDeleted(): void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>
        <TrashIcon />
        Удалить папку…
      </button>
      {confirm && (
        <ConfirmDialog
          title="Удалить папку встречи?"
          confirmLabel="Удалить папку"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            await window.textmeet.deleteMeeting(id);
            onDeleted();
          }}
        >
          Папка {id} переместится в Корзину. Вернуть её можно оттуда.
        </ConfirmDialog>
      )}
    </>
  );
}

function ProgressBar({ value, wide }: { value: number; wide?: boolean }) {
  return (
    <div
      className={wide ? 'prog wide' : 'prog'}
      role="progressbar"
      aria-label="Ход расшифровки"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <i style={{ width: `${value}%` }} />
    </div>
  );
}

/** Ход расшифровки вместо текста — у встречи, которая ещё не расшифровывалась. */
function ProgressBlock({ view }: { view: ProgressView }) {
  return (
    <div className="empty-note">
      <b role="status">{view.text}</b>
      {view.value !== null && <ProgressBar value={view.value} wide />}
      {view.note && <span>{view.note}</span>}
    </div>
  );
}

/** Ход расшифровки заново — полосой над прежним текстом: он виден, пока новый не готов. */
function ProgressStrip({ view }: { view: ProgressView }) {
  return (
    <div className="prog-strip">
      <b role="status">{view.text}</b>
      {view.value !== null && <ProgressBar value={view.value} />}
      {view.note && <span>{view.note}</span>}
      <span className="later">Текст заменится, когда новая расшифровка закончится.</span>
    </div>
  );
}

type BusyStatus = 'queued' | 'transcribing';

/** Текст встречи, связанный с плеером: звучащая реплика подсвечена, щелчок по времени — слушать с этого места. */
function ReadyText({
  load,
  meeting,
  playback,
  canPlay,
  onEdit,
  onError,
}: {
  load: Extract<TranscriptLoad, { kind: 'ready' }>;
  meeting: Meeting;
  playback: Playback;
  canPlay: boolean;
  onEdit: ((edit: TranscriptEdit) => Promise<void>) | null;
  onError(message: string): void;
}) {
  const { transcript } = load;
  const starts = useMemo(() => transcript.segments.map((s) => s.start), [transcript]);
  const search = useContext(SearchViewContext);
  const focus = search.focus?.meetingId === meeting.id ? search.focus : null;
  const { refresh } = search;
  // После правки поиск повторяется: main о ней не сообщает, если meeting.json не менялся.
  const editAndRefresh = useMemo(
    () =>
      onEdit
        ? async (change: TranscriptEdit) => {
            await onEdit(change);
            refresh();
          }
        : null,
    [onEdit, refresh],
  );
  const renameSpeaker = useCallback(
    async (speakerId: SpeakerId, name: string | null) => {
      await window.textmeet.renameSpeaker({ meetingId: meeting.id, speakerId, name });
    },
    [meeting.id],
  );
  // До первого «Слушать» ничего не подсвечено.
  const nowIndex = canPlay && (playback.playing || playback.position > 0) ? segmentAt(starts, playback.position) : -1;
  return (
    <TranscriptView
      transcript={transcript}
      names={meeting.speakerNames}
      nowIndex={nowIndex}
      playing={playback.playing}
      onPlayAt={canPlay ? playback.seekAndPlay : null}
      onEdit={editAndRefresh}
      searchWords={search.words}
      focus={focus}
      onRenameSpeaker={renameSpeaker}
      onError={onError}
    />
  );
}

/** Средняя часть встречи: текст, ход расшифровки или приглашение расшифровать. */
function Body({
  meeting,
  load,
  busy,
  progress,
  playback,
  canPlay,
  onEdit,
  onError,
  onTranscribe,
}: {
  meeting: Meeting;
  load: TranscriptLoad;
  busy: BusyStatus | null;
  progress: TranscriptionProgress | null;
  playback: Playback;
  /** Запись готова к прослушиванию. */
  canPlay: boolean;
  onEdit(edit: TranscriptEdit): Promise<void>;
  onError(message: string): void;
  /** Кнопка «Расшифровать» под «Текста пока нет»; null — её нет (например, она уже в заголовке). */
  onTranscribe: (() => void) | null;
}) {
  const hasAudio = meeting.tracks.length > 0;
  if (load.kind === 'ready') {
    return (
      <>
        {busy && <ProgressStrip view={progressView(busy, progress)} />}
        {/* Пока встреча ждёт расшифровки заново или расшифровывается, прежний текст не правится: правки пропали бы. */}
        <ReadyText
          load={load}
          meeting={meeting}
          playback={playback}
          canPlay={canPlay}
          onEdit={busy ? null : onEdit}
          onError={onError}
        />
      </>
    );
  }
  if (busy) return <ProgressBlock view={progressView(busy, progress)} />;
  if (load.kind === 'error') {
    return (
      <div className="empty-note">
        <b>Не удалось прочитать текст встречи</b>
        <pre className="reason">{load.message}</pre>
      </div>
    );
  }
  if (load.kind === 'loading' || meeting.status === 'error') return <div className="empty-note" />;
  return (
    <div className="empty-note">
      <b>{hasAudio ? 'Запись сохранена' : 'Звука нет'}</b>
      {hasAudio && <span>Текста пока нет.</span>}
      {onTranscribe && (
        <button type="button" className="btn pri" onClick={onTranscribe}>
          Расшифровать
        </button>
      )}
    </div>
  );
}

/** Прочитанная встреча: заголовок, пометки, текст или ход расшифровки, плеер. */
function MeetingView({
  entry,
  progress,
  onError,
  onDeleted,
}: Props & { entry: Extract<MeetingListEntry, { kind: 'ok' }> }) {
  const [dialog, setDialog] = useState(false);
  const { meeting, mixReady, mixFailed } = entry;
  const busy = meeting.status === 'queued' || meeting.status === 'transcribing' ? meeting.status : null;
  const [load, setTranscript, reloadTranscript] = useTranscript(
    meeting.id,
    meeting.status,
    busy !== null || progress !== null,
  );
  // Правка делается к тому тексту, который сейчас показан: id реплик позиционные, чужой текст ими не правят.
  const shownVersion = useRef<string | null>(null);
  shownVersion.current = load.kind === 'ready' ? load.transcript.createdAt : null;
  const edit = useCallback(
    async (change: TranscriptEdit) => {
      const transcriptVersion = shownVersion.current;
      if (transcriptVersion === null) throw new Error(NO_TEXT_TO_EDIT);
      try {
        const result = await window.textmeet.editTranscript({ meetingId: meeting.id, edit: change, transcriptVersion });
        setTranscript(result.transcript);
      } catch (err) {
        // Текст в файле уже другой (расшифровали заново, правили на другом компьютере) — показываем его, а не старый.
        if (isStaleEditMessage(errorText(err))) reloadTranscript();
        throw err;
      }
    },
    [meeting.id, setTranscript, reloadTranscript],
  );
  const playback = usePlayback(meeting.id, meeting.durationSec);
  const canPlay = mixReady && !playback.failed;
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  if (load.kind === 'ready') meta.push(`Текст: ${transcriptModelTitle(load.transcript)}`);
  if (meeting.audioDeleted) meta.push('аудио удалено');
  const hasAudio = meeting.tracks.length > 0;
  const audioBlocked = busy ? AUDIO_BUSY : hasAudio && !mixReady && !mixFailed ? AUDIO_MIXING : null;
  // Текст уже есть (он виден, пока новый не готов) — в окне предупреждаем, что он заменится.
  const hasText = load.kind === 'ready';
  const transcribeError = meeting.status === 'error' && hasAudio;
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  // «Повторить» — той же моделью, что не справилась (её id в meeting.json); неизвестная — из настроек.
  const retry = () =>
    window.textmeet
      .transcribe({
        meetingId: meeting.id,
        participantsHint: meeting.participantsHint,
        model: isAsrModelId(meeting.model) ? meeting.model : null,
      })
      .catch((err: unknown) => onError(errorText(err)));

  return (
    <main className="pane" aria-label="Встреча">
      <header className="head">
        <MeetingTitle meetingId={meeting.id} title={meeting.title} onError={onError} />
        <div className="meta">{meta.join(' · ')}</div>
        <div className="acts">
          {actions.header && (
            <button type="button" className="btn" onClick={() => setDialog(true)}>
              {actions.header}
            </button>
          )}
          <MeetingMenu
            meeting={meeting}
            audioBlocked={audioBlocked}
            releaseAudio={playback.release}
            onDeleted={onDeleted}
            onError={onError}
          />
        </div>
      </header>
      {meeting.recovered && meeting.status !== 'error' && (
        <div className="banner" role="status">
          <WarnIcon />
          <div>
            <b>Запись восстановлена после сбоя</b>
            <p>Запись прервалась из-за сбоя. Сохранено всё, что успело записаться.</p>
          </div>
        </div>
      )}
      {meeting.status === 'error' && (
        <div className="banner" role="alert">
          <WarnIcon />
          <div>
            <b>{transcribeError ? 'Ошибка расшифровки' : 'Ошибка'}</b>
            <p>{meeting.errorMessage ?? 'Что-то пошло не так.'}</p>
            {transcribeError && (
              <div className="acts">
                <button type="button" className="btn" onClick={() => void retry()}>
                  Повторить
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <Body
        meeting={meeting}
        load={load}
        busy={busy}
        progress={progress}
        playback={playback}
        canPlay={canPlay}
        onEdit={edit}
        onError={onError}
        onTranscribe={actions.body ? () => setDialog(true) : null}
      />
      {mixReady ? (
        <Player meetingId={meeting.id} playback={playback} />
      ) : (
        hasAudio && (
          <footer className="player pending">
            {mixFailed
              ? 'Не удалось подготовить запись для прослушивания — дорожки лежат в папке встречи.'
              : 'Готовим запись для прослушивания…'}
          </footer>
        )
      )}
      {dialog && (
        <TranscribeDialog
          meetingId={meeting.id}
          again={actions.header === 'Расшифровать заново'}
          replacesText={hasText}
          losesEdits={hasManualChanges(load.kind === 'ready' ? load.transcript : null, meeting.speakerNames)}
          participantsHint={meeting.participantsHint}
          onClose={() => setDialog(false)}
        />
      )}
    </main>
  );
}

/** Выбранная встреча: создаётся, не прочиталась или прочитана. */
export function MeetingPane({ entry, progress, onError, onDeleted }: Props) {
  if (entry.kind === 'creating') {
    return (
      <main className="pane" aria-label="Встреча">
        <div className="empty-note">
          <b>Встреча создаётся…</b>
          <span>Если это сообщение не исчезает, встреча не успела создаться — папку можно удалить.</span>
          <div className="acts">
            <OpenFolder id={entry.id} onError={onError} />
            <DeleteFolder id={entry.id} onDeleted={onDeleted} />
          </div>
        </div>
      </main>
    );
  }
  if (entry.kind === 'broken') {
    return (
      <main className="pane" aria-label="Встреча">
        <div className="empty-note">
          <b>Не удалось прочитать встречу</b>
          <span>Папка: {entry.id}</span>
          <pre className="reason">{entry.reason}</pre>
          <div className="acts">
            <OpenFolder id={entry.id} onError={onError} />
            <DeleteFolder id={entry.id} onDeleted={onDeleted} />
          </div>
        </div>
      </main>
    );
  }
  return <MeetingView entry={entry} progress={progress} onError={onError} onDeleted={onDeleted} />;
}
