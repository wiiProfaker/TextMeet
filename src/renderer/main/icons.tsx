// Значки — тонкий контур 24×24, цвет берут у текста.
import type { ReactNode } from 'react';

function Icon({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      className="ic"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const MicIcon = () => (
  <Icon>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
);

export const ScreenIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Icon>
);

export const FolderIcon = () => (
  <Icon>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
);

export const WarnIcon = () => (
  <Icon>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v4M12 17.5v.5" />
  </Icon>
);

export const ChevronIcon = () => (
  <Icon>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const PencilIcon = () => (
  <Icon>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Icon>
);

export const MoreIcon = () => (
  <Icon filled>
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </Icon>
);

export const MuteIcon = () => (
  <Icon>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    <path d="M17 9l4 6M21 9l-4 6" />
  </Icon>
);

export const ExportIcon = () => (
  <Icon>
    <path d="M12 15V4M7 9l5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </Icon>
);

export const FileIcon = () => (
  <Icon>
    <path d="M6 3h8l5 5v13H6z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M5 12l5 5 9-10" />
  </Icon>
);

export const ImportIcon = () => (
  <Icon>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon filled>
    <path d="M8 5l11 7-11 7z" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon filled>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Icon>
);
