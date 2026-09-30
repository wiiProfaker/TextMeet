import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { Meeting } from '../../shared/meeting';
import { audioDir } from '../library/library';
import type { PipelineInput } from './pipeline';
import type { TrackInput } from './routing';

async function nonEmpty(file: string): Promise<boolean> {
  return fsp.stat(file).then(
    (stats) => stats.isFile() && stats.size > 0,
    () => false,
  );
}

/** Что расшифровывать: дорожки встречи, которые есть на диске и не пустые, со сдвигами в секундах. */
export async function buildPipelineInput(libraryDir: string, meeting: Meeting): Promise<PipelineInput> {
  const dir = audioDir(libraryDir, meeting.id);
  const tracks: TrackInput[] = [];
  for (const track of meeting.tracks) {
    const file = join(dir, track.file);
    if (await nonEmpty(file)) tracks.push({ kind: track.kind, file, offsetSec: track.startOffsetMs / 1000 });
  }
  return {
    tracks,
    recordedSystem: meeting.tracks.some((t) => t.kind === 'system'),
    participantsHint: meeting.participantsHint,
    durationSec: meeting.durationSec ?? 0,
  };
}
