import { useEffect, useState } from "react";
import type { AvailableUpdate } from "../../shared/update";
import { errorText } from "./errors";

/** Новая версия, которую стоит показать: сначала запрос, дальше — события main. */
function useAvailableUpdate(): AvailableUpdate | null {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  useEffect(() => {
    let active = true;
    let gotEvent = false;
    const unsubscribe = window.textmeet.onUpdateChanged((next) => {
      gotEvent = true;
      setUpdate(next);
    });
    window.textmeet
      .getUpdate()
      .then((initial) => {
        if (active && !gotEvent) setUpdate(initial);
      })
      .catch((err: unknown) =>
        console.error(
          "TextMeet: сведения о новой версии не получены",
          errorText(err),
        ),
      );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return update;
}

/**
 * «Вышла версия X.Y.Z» внизу левой колонки (решения Плана 8, §4.4): «Скачать» — страница выпуска в браузере, «Скрыть» —
 * больше не показывать про эту версию. Во время записи не показывается (появится после остановки).
 */
export function UpdateBanner({
  recording,
  onError,
}: {
  recording: boolean;
  onError(message: string): void;
}) {
  const update = useAvailableUpdate();
  if (!update || recording) return null;
  return (
    <section className="upd" aria-label="Новая версия">
      <span>Вышла версия {update.version}</span>
      <button
        type="button"
        className="lnk"
        onClick={() =>
          window.textmeet
            .openUpdate()
            .catch((err: unknown) => onError(errorText(err)))
        }
      >
        Скачать
      </button>
      <button
        type="button"
        className="lnk"
        onClick={() =>
          window.textmeet
            .dismissUpdate(update.version)
            .catch((err: unknown) => onError(errorText(err)))
        }
      >
        Скрыть
      </button>
    </section>
  );
}
