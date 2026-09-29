import { useEffect, useRef, useState } from 'react';
import { formatDuration } from './format';
import { PauseIcon, PlayIcon } from './icons';

const SPEEDS = [1, 1.5, 2] as const;
const speedLabel = (speed: number): string => `${String(speed).replace('.', ',')}×`;

/** Плеер сведённой записи встречи (audio/mix.opus через протокол tm-media). */
export function Player({ meetingId, fallbackDuration }: { meetingId: string; fallbackDuration: number | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | null>(fallbackDuration);
  const [speed, setSpeed] = useState<number>(1);
  const [failed, setFailed] = useState(false);

  // Другая встреча — плеер с нуля.
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(fallbackDuration);
    setFailed(false);
  }, [meetingId, fallbackDuration]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setFailed(true));
    else el.pause();
  };

  const nextSpeed = () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1);

  if (failed) {
    return <footer className="player pending">Не удалось открыть запись для прослушивания.</footer>;
  }

  return (
    <footer className="player">
      <audio
        ref={audio}
        preload="metadata"
        src={`tm-media://meeting/${meetingId}/mix.opus`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
          e.currentTarget.playbackRate = speed;
        }}
        onError={() => setFailed(true)}
      />
      <button type="button" className="play" aria-label={playing ? 'Пауза' : 'Слушать'} onClick={toggle}>
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
        onChange={(e) => {
          const el = audio.current;
          const value = Number(e.currentTarget.value);
          if (el) el.currentTime = value;
          setPosition(value);
        }}
      />
      <span className="ptime">{formatDuration(duration)}</span>
      <button type="button" className="speed" aria-label="Скорость воспроизведения" onClick={nextSpeed}>
        {speedLabel(speed)}
      </button>
    </footer>
  );
}
