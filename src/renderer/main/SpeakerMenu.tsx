import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { SpeakerId } from '../../shared/transcript';
import { PlusIcon } from './icons';
import { speakerTone } from './transcription-format';

export interface SpeakerOption {
  id: SpeakerId;
  label: string;
}

interface Props {
  options: readonly SpeakerOption[];
  current: SpeakerId;
  onPick(speakerId: SpeakerId | 'new'): void;
  onClose(): void;
}

/** «Кто говорит в этой реплике?» — меню под именем спикера (лист 11 макета). Стрелки, Enter, Esc. */
export function SpeakerMenu({ options, current, onPick, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    // Щелчок мимо меню закрывает его.
    const onDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
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
