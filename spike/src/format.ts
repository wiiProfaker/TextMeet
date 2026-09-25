export interface Utterance {
  readonly start: number; // секунды от начала записи
  readonly end: number;
  readonly speaker: string;
  readonly text: string;
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const seconds = String(s % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

export function speakerLabel(speakerId: number): string {
  return `Спикер ${speakerId + 1}`;
}

export function formatTranscript(utterances: readonly Utterance[]): string {
  return utterances
    .filter((u) => u.text.trim().length > 0)
    .map((u) => `[${formatTimestamp(u.start)}] ${u.speaker}: ${u.text.trim()}`)
    .join('\n');
}
