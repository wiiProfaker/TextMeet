import type { SoundKind } from '../../shared/recording';
import { soundNotes } from './media';

const VOLUME = 0.18;
let context: AudioContext | null = null;

/** Короткий сигнал старта или стопа — без звуковых файлов, синусом. */
export function playSound(kind: SoundKind): void {
  context ??= new AudioContext();
  const ctx = context;
  void ctx.resume();
  const t0 = ctx.currentTime + 0.02;
  for (const note of soundNotes(kind)) {
    const start = t0 + note.at;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = note.frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(VOLUME, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + note.duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.01);
  }
}
