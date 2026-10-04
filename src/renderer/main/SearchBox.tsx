import { CloseIcon, SearchIcon } from './icons';

/** Поле «Поиск по всем встречам» над списком; крестик и Esc очищают поиск. */
export function SearchBox({ value, onChange }: { value: string; onChange(next: string): void }) {
  return (
    <label className={value ? 'search on' : 'search'}>
      <SearchIcon />
      <input
        type="text"
        role="searchbox"
        placeholder="Поиск по всем встречам"
        aria-label="Поиск по всем встречам"
        value={value}
        maxLength={500}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
      />
      {value && (
        <button type="button" className="clr" aria-label="Очистить поиск" onClick={() => onChange('')}>
          <CloseIcon />
        </button>
      )}
    </label>
  );
}
