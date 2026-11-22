import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_PROMPT } from '../../shared/ai-prompt';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { aiPath } from '../ai/ai-store';
import { createMeeting, updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
import { copyForAi, copyMeeting, exportTexts, saveMeeting, type ExportDeps } from './export-meeting';

const transcript: Transcript = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-10-05T10:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
  ],
  segments: [
    { id: 'a', start: 708, end: 712, speakerId: 's1', text: 'Смотри, по бюджету.', edited: false },
    { id: 'b', start: 715, end: 718, speakerId: 's1', text: 'Подрядчиков отдельно.', edited: true },
    { id: 'c', start: 724, end: 726, speakerId: 'me', text: 'Понял.', edited: false },
  ],
};

async function meetingWithText(text: Transcript | null = transcript): Promise<{ lib: string; id: string }> {
  const lib = makeTempDir('textmeet-export-');
  const meeting = await createMeeting(lib, {
    source: 'recording',
    status: 'done',
    title: 'Созвон: Ирина / бюджет',
    now: new Date(2026, 8, 27, 16, 20),
  });
  await updateMeeting(lib, meeting.id, (m) => ({ ...m, durationSec: 32 * 60, speakerNames: { s1: 'Ирина' } }));
  if (text) await writeTranscript(lib, meeting.id, text);
  return { lib, id: meeting.id };
}

type Clip = { text: string; html?: string };

function deps(lib: string, over: Partial<ExportDeps> = {}): ExportDeps & { clipboard: Clip[] } {
  const clipboard: Clip[] = [];
  const out = makeTempDir('textmeet-export-out-');
  return {
    clipboard,
    libraryDir: () => lib,
    chooseSavePath: async (defaultPath) => join(out, defaultPath.split(/[\\/]/).pop() ?? 'x'),
    writeClipboard: async (data) => {
      clipboard.push(data);
    },
    exportDir: () => null,
    confirmReplace: async () => true,
    aiPrompt: async () => null,
    rememberExportDir: async () => undefined,
    documentsDir: () => out,
    platform: 'win32',
    logger: { warn: vi.fn() },
    ...over,
  };
}

describe('copyMeeting', () => {
  it('puts the plain and the formatted text into the clipboard', async () => {
    const { lib, id } = await meetingWithText();
    const d = deps(lib);
    await copyMeeting(d, id);
    expect(d.clipboard).toHaveLength(1);
    expect(d.clipboard[0]?.text).toBe(
      'Созвон: Ирина / бюджет\n27 сентября 2026, 16:20 · 32 мин\nУчастники: Ирина, Я\n\n' +
        'Ирина [11:48]\nСмотри, по бюджету. Подрядчиков отдельно.\n\nЯ [12:04]\nПонял.\n',
    );
    expect(d.clipboard[0]?.html).toContain('<b>Ирина</b>');
  });

  it('refuses a meeting without text', async () => {
    const { lib, id } = await meetingWithText(null);
    await expect(copyMeeting(deps(lib), id)).rejects.toThrow(exportTexts.noText);
    const empty = await meetingWithText({ ...transcript, segments: [] });
    await expect(copyMeeting(deps(empty.lib), empty.id)).rejects.toThrow(exportTexts.noText);
  });

  it('says plainly that the text could not be read', async () => {
    const { lib, id } = await meetingWithText();
    writeFileSync(join(lib, id, 'transcript.json'), '{ сломано');
    await expect(copyMeeting(deps(lib), id)).rejects.toThrow(exportTexts.unreadable);
  });
});

const PLAIN =
  'Созвон: Ирина / бюджет\n27 сентября 2026, 16:20 · 32 мин\nУчастники: Ирина, Я\n\n' +
  'Ирина [11:48]\nСмотри, по бюджету. Подрядчиков отдельно.\n\nЯ [12:04]\nПонял.\n';

describe('copyForAi', () => {
  it('puts the standard prompt, an empty line and the plain text — without html', async () => {
    const { lib, id } = await meetingWithText();
    const d = deps(lib);
    await copyForAi(d, id);
    expect(d.clipboard).toEqual([{ text: `${DEFAULT_AI_PROMPT}\n\n${PLAIN}` }]);
  });

  it('takes the own prompt from the settings at the moment of copying', async () => {
    const { lib, id } = await meetingWithText();
    let prompt: string | null = 'Что решили?';
    const d = deps(lib, { aiPrompt: async () => prompt });
    await copyForAi(d, id);
    prompt = '  Кратко.\r\nПо пунктам.  ';
    await copyForAi(d, id);
    expect(d.clipboard.map((c) => c.text)).toEqual([`Что решили?\n\n${PLAIN}`, `Кратко.\nПо пунктам.\n\n${PLAIN}`]);
  });

  it('copies only the text when the prompt is empty', async () => {
    const { lib, id } = await meetingWithText();
    const d = deps(lib, { aiPrompt: async () => '' });
    await copyForAi(d, id);
    expect(d.clipboard).toEqual([{ text: PLAIN }]);
  });

  it('refuses a meeting without text and says plainly that the text could not be read', async () => {
    const empty = await meetingWithText(null);
    await expect(copyForAi(deps(empty.lib), empty.id)).rejects.toThrow(exportTexts.noText);
    const { lib, id } = await meetingWithText();
    writeFileSync(join(lib, id, 'transcript.json'), '{ сломано');
    const d = deps(lib);
    await expect(copyForAi(d, id)).rejects.toThrow(exportTexts.unreadable);
    expect(d.clipboard).toEqual([]);
  });
});

describe('saveMeeting', () => {
  it('offers a safe file name in the documents folder and remembers the folder', async () => {
    const { lib, id } = await meetingWithText();
    const remembered: string[] = [];
    let offered = '';
    const d = deps(lib, {
      chooseSavePath: async (defaultPath) => {
        offered = defaultPath;
        return defaultPath;
      },
      rememberExportDir: async (dir) => {
        remembered.push(dir);
      },
    });
    expect(await saveMeeting(d, id, 'txt')).toEqual({ saved: true });
    expect(offered).toBe(join(d.documentsDir(), 'Созвон Ирина бюджет.txt'));
    expect(remembered).toEqual([d.documentsDir()]);
  });

  it('starts in the folder of the last export', async () => {
    const { lib, id } = await meetingWithText();
    const last = makeTempDir('textmeet-export-last-');
    let offered = '';
    const d = deps(lib, {
      exportDir: () => last,
      chooseSavePath: async (defaultPath) => {
        offered = defaultPath;
        return null;
      },
    });
    expect(await saveMeeting(d, id, 'docx')).toEqual({ saved: false });
    expect(offered).toBe(join(last, 'Созвон Ирина бюджет.docx'));
  });

  it('starts in the documents folder when the folder of the last export is gone', async () => {
    const { lib, id } = await meetingWithText();
    const gone = join(makeTempDir('textmeet-export-last-'), 'удалена');
    const notFolder = join(makeTempDir('textmeet-export-last-'), 'файл');
    writeFileSync(notFolder, 'не папка');
    for (const last of [gone, notFolder]) {
      let offered = '';
      const d = deps(lib, {
        exportDir: () => last,
        chooseSavePath: async (defaultPath) => {
          offered = defaultPath;
          return null;
        },
      });
      await saveMeeting(d, id, 'txt');
      expect(offered).toBe(join(d.documentsDir(), 'Созвон Ирина бюджет.txt'));
    }
  });

  it('writes text with a BOM and Windows line endings on Windows', async () => {
    const { lib, id } = await meetingWithText();
    const target = join(makeTempDir('textmeet-export-txt-'), 'итоги.txt');
    await saveMeeting(deps(lib, { chooseSavePath: async () => target }), id, 'txt');
    const bytes = readFileSync(target);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.toString('utf8').slice(1);
    expect(text.startsWith('Созвон: Ирина / бюджет\r\n27 сентября 2026')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('writes plain line endings on the Mac', async () => {
    const { lib, id } = await meetingWithText();
    const target = join(makeTempDir('textmeet-export-mac-'), 'итоги.txt');
    await saveMeeting(deps(lib, { platform: 'darwin', chooseSavePath: async () => target }), id, 'txt');
    expect(readFileSync(target, 'utf8')).not.toContain('\r');
  });

  it('writes a Word file and adds the extension when it was typed without one', async () => {
    const { lib, id } = await meetingWithText();
    const dir = makeTempDir('textmeet-export-docx-');
    await saveMeeting(deps(lib, { chooseSavePath: async () => join(dir, 'итоги') }), id, 'docx');
    expect(readFileSync(join(dir, 'итоги.docx')).subarray(0, 2).toString()).toBe('PK');
  });

  it('asks before replacing an existing file when the extension was appended', async () => {
    const { lib, id } = await meetingWithText();
    const dir = makeTempDir('textmeet-export-replace-');
    const existing = join(dir, 'Итоги.docx');
    writeFileSync(existing, 'old');
    const asked: string[] = [];
    const rememberExportDir = vi.fn(async () => undefined);
    const refuse = deps(lib, {
      chooseSavePath: async () => join(dir, 'Итоги'),
      confirmReplace: async (path) => {
        asked.push(path);
        return false;
      },
      rememberExportDir,
    });
    expect(await saveMeeting(refuse, id, 'docx')).toEqual({ saved: false });
    expect(asked).toEqual([existing]);
    expect(readFileSync(existing, 'utf8')).toBe('old');
    expect(rememberExportDir).not.toHaveBeenCalled();

    const accept = deps(lib, { chooseSavePath: async () => join(dir, 'Итоги'), confirmReplace: async () => true });
    expect(await saveMeeting(accept, id, 'docx')).toEqual({ saved: true });
    expect(readFileSync(existing).subarray(0, 2).toString()).toBe('PK');
  });

  it('does not ask when the dialog returned the name with the extension', async () => {
    const { lib, id } = await meetingWithText();
    const dir = makeTempDir('textmeet-export-replace-');
    writeFileSync(join(dir, 'Итоги.docx'), 'old');
    const confirmReplace = vi.fn(async () => false);
    const d = deps(lib, { chooseSavePath: async () => join(dir, 'Итоги.docx'), confirmReplace });
    expect(await saveMeeting(d, id, 'docx')).toEqual({ saved: true });
    expect(confirmReplace).not.toHaveBeenCalled();
  });

  it('does not ask when there is no file with the appended extension', async () => {
    const { lib, id } = await meetingWithText();
    const dir = makeTempDir('textmeet-export-replace-');
    const confirmReplace = vi.fn(async () => false);
    const d = deps(lib, { chooseSavePath: async () => join(dir, 'Итоги'), confirmReplace });
    expect(await saveMeeting(d, id, 'txt')).toEqual({ saved: true });
    expect(confirmReplace).not.toHaveBeenCalled();
  });

  it('writes the export atomically: a failed write leaves no half file', async () => {
    const { lib, id } = await meetingWithText();
    const dir = makeTempDir('textmeet-export-atomic-');
    const target = join(dir, 'итоги.txt');
    writeFileSync(target, 'old');
    const d = deps(lib, {
      chooseSavePath: async () => target,
      rename: async () => {
        throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
      },
    });
    await expect(saveMeeting(d, id, 'txt')).rejects.toThrow('Не удалось сохранить файл');
    expect(readFileSync(target, 'utf8')).toBe('old');
    expect(readdirSync(dir)).toEqual(['итоги.txt']);
  });

  it('a file held by another program (Word) is said plainly', async () => {
    const { lib, id } = await meetingWithText();
    const dir = makeTempDir('textmeet-export-busy-');
    const target = join(dir, 'итоги.docx');
    writeFileSync(target, 'old');
    const d = deps(lib, {
      chooseSavePath: async () => target,
      rename: async () => {
        throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
      },
    });
    await expect(saveMeeting(d, id, 'docx')).rejects.toThrow('Не удалось сохранить файл: файл занят другой программой');
  });

  it('a failed write is said plainly and the folder is not remembered', async () => {
    const { lib, id } = await meetingWithText();
    const rememberExportDir = vi.fn(async () => undefined);
    const d = deps(lib, {
      chooseSavePath: async () => join(lib, 'нет такой папки', 'итоги.txt'),
      rememberExportDir,
    });
    await expect(saveMeeting(d, id, 'txt')).rejects.toThrow('Не удалось сохранить файл: папка не найдена');
    expect(rememberExportDir).not.toHaveBeenCalled();
  });

  it('keeps the saved file even if the folder could not be remembered', async () => {
    const { lib, id } = await meetingWithText();
    const d = deps(lib, { rememberExportDir: async () => Promise.reject(new Error('диск')) });
    expect(await saveMeeting(d, id, 'txt')).toEqual({ saved: true });
    expect(d.logger.warn).toHaveBeenCalled();
  });
});

describe('the summary in the export', () => {
  const summary = {
    text: '- Бюджет — **половина**.',
    model: 'qwen3.5-9b',
    modelTitle: 'Qwen3.5 9B',
    createdAt: '2026-09-27T13:55:00.000Z',
    status: 'done',
    sourceHash: 'h',
  };

  it('copies and saves the summary first, but «Скопировать для ИИ» stays without it', async () => {
    const { lib, id } = await meetingWithText();
    writeFileSync(aiPath(lib, id), JSON.stringify({ version: 1, summary, questions: [] }));
    const d = deps(lib);
    await copyMeeting(d, id);
    expect(d.clipboard[0]?.text).toContain('Итоги встречи');
    expect(d.clipboard[0]?.text).toContain('• Бюджет — половина.');
    expect(d.clipboard[0]?.html).toContain('<b>половина</b>');
    await copyForAi(d, id);
    expect(d.clipboard[1]?.text).not.toContain('Итоги встречи');
    expect(d.clipboard[1]?.text).not.toContain('Бюджет');
  });

  it('exports without the summary when ai.json is broken', async () => {
    const { lib, id } = await meetingWithText();
    writeFileSync(aiPath(lib, id), '{ сломано');
    const d = deps(lib);
    await copyMeeting(d, id);
    expect(d.clipboard[0]?.text).not.toContain('Итоги встречи');
    expect(d.clipboard[0]?.text).toContain('Смотри, по бюджету.');
  });
});
