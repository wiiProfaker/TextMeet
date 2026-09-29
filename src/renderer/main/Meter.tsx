import { litSegments, METER_SEGMENTS } from '../../shared/recording';

/** Индикатор уровня: 20 делений по шкале −60…0 дБ. */
export function Meter({ peak, label, big = false }: { peak: number | null; label: string; big?: boolean }) {
  const lit = peak === null ? 0 : litSegments(peak);
  return (
    <div
      className={big ? 'meter big' : 'meter'}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={METER_SEGMENTS}
      aria-valuenow={lit}
    >
      {Array.from({ length: METER_SEGMENTS }, (_, i) => (
        <i key={i} className={i < lit ? 'on' : undefined} />
      ))}
    </div>
  );
}
