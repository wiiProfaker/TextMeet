import { useState } from 'react';
import { LibraryScreen } from './LibraryScreen';
import { SettingsScreen } from './SettingsScreen';

type Screen = 'library' | 'settings';

const TABS: { id: Screen; label: string }[] = [
  { id: 'library', label: 'Встречи' },
  { id: 'settings', label: 'Настройки' },
];

export function App() {
  const [screen, setScreen] = useState<Screen>('library');

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">TextMeet</span>
        <nav className="tabs" aria-label="Разделы">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="tab"
              aria-current={screen === tab.id ? 'page' : undefined}
              onClick={() => setScreen(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">{screen === 'library' ? <LibraryScreen /> : <SettingsScreen />}</main>
    </div>
  );
}
