import type { MenuItemConstructorOptions } from 'electron';

/**
 * Меню программы на macOS: без «Перезагрузить» и инструментов разработчика.
 * «Правка» нужна, чтобы в полях работали ⌘C / ⌘V / ⌘A. На Windows меню нет совсем.
 */
export function macMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    {
      label: 'TextMeet',
      submenu: [
        { role: 'about', label: 'О программе TextMeet' },
        { type: 'separator' },
        { role: 'hide', label: 'Скрыть TextMeet' },
        { role: 'hideOthers', label: 'Скрыть остальные' },
        { role: 'unhide', label: 'Показать все' },
        { type: 'separator' },
        { role: 'quit', label: 'Выйти из TextMeet' },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выбрать всё' },
      ],
    },
    {
      label: 'Окно',
      submenu: [
        { role: 'minimize', label: 'Свернуть' },
        { role: 'close', label: 'Закрыть окно' },
      ],
    },
  ];
}
