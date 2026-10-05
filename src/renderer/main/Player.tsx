import { formatDuration } from './format';
import type { Playback } from './hooks';
import { PauseIcon, PlayIcon } from './icons';
import { speedLabel } from './playback';

/** Плеер сведённой записи встречи (audio/mix.opus через протокол tm-media). Управление — usePlayback. */
export function Player({ meetingId, playback }: { meetingId: string; playback: Playback }) {
  const { ref, playing, position, duration, speed, failed, events } = playback;

  if (failed) {
    return <footer className="player pending">Не удалось открыть запись для прослушивания.</footer>;
  }

  return (
    <footer className="player">
      <audio ref={ref} preload="metadata" src={`tm-media://meeting/${meetingId}/mix.opus`} {...events} />
      <button type="button" className="play" aria-label={playing ? 'Пауза' : 'Слушать'} onClick={playback.toggle}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="ptime">{formatDuration(position)}</span>
      <input
        className="track"
        type="range"
        min={0}
        max={duration ?? 0}
        step={0.1}
        value={Math.min(position, duration ?? 0)}
        aria-label="Место в записи"
        onChange={(e) => playback.seek(Number(e.currentTarget.value))}
      />
      <span className="ptime">{formatDuration(duration)}</span>
      <button
        type="button"
        className="speed"
        aria-label={`Скорость воспроизведения: ${speedLabel(speed)}`}
        onClick={playback.nextSpeed}
      >
        {speedLabel(speed)}
      </button>
    </footer>
  );
}
