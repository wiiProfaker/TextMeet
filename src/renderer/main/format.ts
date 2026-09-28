import type { LaunchAtLoginNotice } from '../../shared/ipc';
import type { MeetingStatus } from '../../shared/meeting';

const pad = (n: number): string => String(n).padStart(2, '0');

const STATUS_LABELS: Record<MeetingStatus, string> = {
  recording: 'Идёт запись',
  recorded: 'Записано',
  queued: 'В очереди',
  transcribing: 'Расшифровка…',
  done: 'Готово',
  error: 'Ошибка',
};

export function statusLabel(status: MeetingStatus): string {
  return STATUS_LABELS[status];
}

/** 75 → «1:15», 3725 → «1:02:05», неизвестно → «—». */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** ISO-дата → «25.09.2026 14:30» в местном времени. */
export function formatMeetingDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const NOTICE_TEXT: Record<LaunchAtLoginNotice, string | null> = {
  none: null,
  'dev-build': 'Автозапуск работает только в установленной программе — сейчас открыта версия для разработки.',
  'needs-approval': 'macOS ждёт разрешения: Системные настройки → Основные → Объекты входа → включите TextMeet.',
  'blocked-by-system':
    'Автозапуск выключен в системе. Windows: Диспетчер задач → Автозагрузка. macOS: Системные настройки → Основные → Объекты входа.',
  unsupported: 'На этой системе автозапуск не поддерживается.',
};

export function launchAtLoginNoticeText(notice: LaunchAtLoginNotice): string | null {
  return NOTICE_TEXT[notice];
}
