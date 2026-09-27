import { randomBytes } from 'node:crypto';

const pad = (n: number): string => String(n).padStart(2, '0');

/** id и имя папки встречи: `2026-09-25_1430_a1b2c3` (местное время). */
export function makeMeetingId(date: Date, suffix: string): string {
  if (!/^[0-9a-f]{6}$/.test(suffix)) throw new RangeError(`Неверный суффикс id встречи: ${suffix}`);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}_${pad(date.getHours())}${pad(date.getMinutes())}_${suffix}`;
}

export function randomMeetingSuffix(): string {
  return randomBytes(3).toString('hex');
}

/** «Встреча 25.09.2026 14:30» */
export function defaultMeetingTitle(date: Date): string {
  const day = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  return `Встреча ${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
