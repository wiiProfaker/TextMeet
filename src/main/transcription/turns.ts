// Ходы спикеров на одной дорожке: чистые функции без нативного кода (спецификация Плана 3, §4.2, §4.5, §4.6).

export interface Interval {
  /** Секунды от начала дорожки. */
  start: number;
  end: number;
}

export interface Turn extends Interval {
  /** Номер спикера на дорожке, с нуля. */
  speaker: number;
}

/** Вложенная в чужую реплику короткая реплика («угу», «да») отбрасывается — её слова и так звучат в чужой. */
export const BACKCHANNEL_MAX_SEC = 1.5;
/** Речь, которую не покрыло разделение по голосам, короче этого не добавляется. */
export const MIN_GAP_SPEECH_SEC = 0.5;
/** Участки короче (доли миллисекунды из-за округления) при делении наложений пропускаются. */
const MIN_PIECE_SEC = 0.001;
/** Соседние ходы одного спикера с паузой не длиннее этой склеиваются. */
export const MERGE_GAP_SEC = 1.0;
/** Склеенная реплика не длиннее (дальше её всё равно режут на куски ≤ 20 с для распознавания). */
export const MERGE_MAX_SEC = 60;

const length = (i: Interval): number => i.end - i.start;
// При одинаковом начале длинный ход первым: тогда короткий оказывается «внутри» него.
const byStart = <T extends Interval>(a: T, b: T): number => a.start - b.start || b.end - a.end;

const contains = (outer: Interval, inner: Interval): boolean => outer.start <= inner.start && inner.end <= outer.end;
/** outer шире inner и целиком его накрывает. */
const strictlyContains = (outer: Interval, inner: Interval): boolean =>
  contains(outer, inner) && (outer.start < inner.start || inner.end < outer.end);

/**
 * Реплики без наложений: каждый участок звука распознаётся один раз (решения Плана 3, §4.5).
 * - короткая (< 1,5 с) реплика целиком внутри чужой («угу», «да») отбрасывается;
 * - на участке, где звучат несколько ходов, вложенный ход побеждает тот, что его накрывает;
 * - остальным участок делится поровну по порядку начала (два частично наложенных хода — граница посередине);
 * - соседние куски одного спикера сливаются.
 */
export function exclusiveTurns(turns: readonly Turn[]): Turn[] {
  const valid = turns.filter((t) => length(t) > 0);
  const kept = valid.filter(
    (t) => length(t) >= BACKCHANNEL_MAX_SEC || !valid.some((o) => o !== t && o.speaker !== t.speaker && contains(o, t)),
  );
  const bounds = [...new Set(kept.flatMap((t) => [t.start, t.end]))].sort((a, b) => a - b);
  const pieces: Turn[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const from = bounds[k]!;
    const to = bounds[k + 1]!;
    // Границы из дробных секунд бывают «почти равны» (12.399999… и 12.4): такие щели звука не содержат.
    if (to - from < MIN_PIECE_SEC) continue;
    const active = kept.filter((t) => t.start <= from && to <= t.end);
    const owners = active.filter((a) => !active.some((b) => b !== a && strictlyContains(a, b))).sort(byStart);
    const share = (to - from) / owners.length;
    owners.forEach((owner, n) => {
      // Последний кусок кончается ровно на границе: иначе округление даст наложение на следующий участок.
      const end = n === owners.length - 1 ? to : from + share * (n + 1);
      pieces.push({ start: from + share * n, end, speaker: owner.speaker });
    });
  }
  const result: Turn[] = [];
  for (const piece of pieces) {
    const last = result.at(-1);
    if (last && last.speaker === piece.speaker && last.end === piece.start) result[result.length - 1] = { ...last, end: piece.end };
    else result.push(piece);
  }
  return result;
}

/** Части интервала, не покрытые ни одним из (отсортированных, непересекающихся) ходов. */
function uncovered(speech: Interval, turns: readonly Turn[]): Interval[] {
  const parts: Interval[] = [];
  let cursor = speech.start;
  for (const turn of turns) {
    if (turn.end <= cursor) continue;
    if (turn.start >= speech.end) break;
    if (turn.start > cursor) parts.push({ start: cursor, end: turn.start });
    cursor = Math.max(cursor, turn.end);
    if (cursor >= speech.end) break;
  }
  if (cursor < speech.end) parts.push({ start: cursor, end: speech.end });
  return parts;
}

const distance = (a: Interval, b: Interval): number => Math.max(0, a.start - b.end, b.start - a.end);

/**
 * Речь, найденная детектором речи, но не попавшая ни в один ход, становится ходом спикера
 * ближайшего по времени хода (если ходов нет — спикера 0). Ожидает ходы без наложений.
 */
export function fillGaps(turns: readonly Turn[], speech: readonly Interval[]): Turn[] {
  const sorted = [...turns].sort(byStart);
  const added: Turn[] = [];
  for (const part of speech.flatMap((s) => uncovered(s, sorted))) {
    if (length(part) < MIN_GAP_SPEECH_SEC) continue;
    const nearest = sorted.reduce<Turn | null>(
      (best, t) => (best === null || distance(part, t) < distance(part, best) ? t : best),
      null,
    );
    added.push({ ...part, speaker: nearest?.speaker ?? 0 });
  }
  return [...sorted, ...added].sort(byStart);
}

/** Склеивает соседние ходы одного спикера с короткой паузой, не длиннее maxLenSec. */
export function mergeTurns(turns: readonly Turn[], maxGapSec = MERGE_GAP_SEC, maxLenSec = MERGE_MAX_SEC): Turn[] {
  const result: Turn[] = [];
  for (const turn of [...turns].sort(byStart)) {
    const last = result.at(-1);
    if (
      last &&
      last.speaker === turn.speaker &&
      turn.start - last.end <= maxGapSec &&
      Math.max(last.end, turn.end) - last.start <= maxLenSec
    ) {
      result[result.length - 1] = { ...last, end: Math.max(last.end, turn.end) };
    } else {
      result.push({ ...turn });
    }
  }
  return result;
}

/** Номера спикеров по порядку первого появления: первый заговоривший — 0. Ожидает ходы по времени. */
export function renumberByFirstAppearance(turns: readonly Turn[]): Turn[] {
  const order: number[] = [];
  for (const turn of turns) if (!order.includes(turn.speaker)) order.push(turn.speaker);
  return turns.map((turn) => ({ ...turn, speaker: order.indexOf(turn.speaker) }));
}
