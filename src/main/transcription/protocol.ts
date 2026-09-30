// Сообщения между main и процессом расшифровки (utilityProcess). Проверяются zod с обеих сторон.
import { z } from 'zod';
import { TrackKindSchema } from '../../shared/meeting';
import { SpeakerIdSchema } from '../../shared/transcript';

const TrackInputSchema = z.object({ kind: TrackKindSchema, file: z.string().min(1), offsetSec: z.number().nonnegative() });

export const PipelineInputSchema = z.object({
  tracks: z.array(TrackInputSchema).max(2),
  recordedSystem: z.boolean(),
  participantsHint: z.number().int().min(1).max(50).nullable(),
  durationSec: z.number().nonnegative(),
});

export const MainToWorkerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('transcribe'),
    jobId: z.string().min(1),
    input: PipelineInputSchema,
    modelsDir: z.string().min(1),
    ffmpegPath: z.string().min(1),
    threads: z.number().int().min(1).max(64),
  }),
  z.object({ type: z.literal('threads'), threads: z.number().int().min(1).max(64) }),
]);

const StageSchema = z.enum(['prepare', 'me', 'diarize', 'others']);

export const WorkerToMainSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), engine: z.string() }),
  z.object({
    type: z.literal('progress'),
    jobId: z.string(),
    progress: z.object({
      stage: StageSchema,
      fraction: z.number().min(0).max(1),
      diarize: z.object({ to: z.number().min(0).max(1), expectedMs: z.number().nonnegative() }).optional(),
    }),
  }),
  z.object({
    type: z.literal('done'),
    jobId: z.string(),
    result: z.object({
      segments: z.array(
        z.object({
          id: z.string(),
          start: z.number(),
          end: z.number(),
          speakerId: SpeakerIdSchema,
          text: z.string(),
        }),
      ),
      speakers: z.array(z.object({ id: SpeakerIdSchema, kind: z.enum(['me', 'other']) })),
      skippedTracks: z.array(z.object({ kind: TrackKindSchema, message: z.string() })).default([]),
    }),
  }),
  z.object({ type: z.literal('failed'), jobId: z.string(), message: z.string() }),
]);

export type MainToWorker = z.infer<typeof MainToWorkerSchema>;
export type WorkerToMain = z.infer<typeof WorkerToMainSchema>;
export type TranscribeCommand = Extract<MainToWorker, { type: 'transcribe' }>;
