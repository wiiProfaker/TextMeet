import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { SpeakerId } from '../../shared/transcript';
import { PlusIcon } from './icons';
import { menuFocusStep } from './menu-keys';
import { speakerTone } from './transcription-format';

export interface SpeakerOption {
  id: SpeakerId;
  label: string;
}

interface Props {
  options: readonly SpeakerOption[];
  current: SpeakerId;
  onPick(speakerId: SpeakerId | 'new'): void;
  /** returnFocus — закрыли с клавиатуры: фокус вернуть на имя спикера. */
  onClose(returnFocus: boolean): void;
}

/** «Кто говорит в этой реплике?» — меню под именем спикера (лист 11 макета). Стрелки, Enter, Esc. */
export function SpeakerMenu({ options, current, onPick, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  // Последний onClose: подписка ставится один раз, при открытии (иначе каждая перерисовка реплики сбрасывала бы
  // фокус на текущего спикера).
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    // Меню у нижнего края текста может выйти за видимое — показать его целиком.
    menu.current?.scrollIntoView({ block: 'nearest' });
    const items = menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    (menu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? items?.[0])?.focus();
    // Щелчок мимо меню закрывает его; по имени спикера — нет: имя само закрывает меню.
    const onDown = (event: PointerEvent) => {
      if (!menu.current?.parentElement?.contains(event.target as Node)) close.current(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[menuFocusStep(at, items.length, event.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    }
  };

  return (
    <div ref={menu} className="menu" role="menu" aria-label="Кто говорит в этой реплике" onKeyDown={move}>
      <div className="mhead" aria-hidden="true">
        Кто говорит в этой реплике?
      </div>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="mi"
          role="menuitemradio"
          aria-checked={option.id === current}
          onClick={() => onPick(option.id)}
        >
          <span className={`pip ${speakerTone(option.id)}`} />
          <span className="mi-label">{option.label}</span>
          {option.id === current && <span aria-hidden="true">✓</span>}
        </button>
      ))}
      <div className="sep" role="separator" />
      <button type="button" className="mi" role="menuitem" onClick={() => onPick('new')}>
        <PlusIcon />
        <span className="mi-label">Новый собеседник</span>
      </button>
    </div>
  );
}
