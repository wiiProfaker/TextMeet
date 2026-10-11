// Небольшие аудио- и видеофайлы для проверок импорта. Делает их настоящий ffmpeg (ffmpeg-static); кодеки — только
// встроенные в сам ffmpeg, чтобы файлы получались на сборках для Windows, Mac и Linux.
import { resolveFfmpegPath, runFfmpeg } from '../main/audio/ffmpeg';

const tone = (seconds: number): string[] => ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`];
const picture = (seconds: number): string[] => ['-f', 'lavfi', '-i', `testsrc=size=160x120:rate=5:duration=${seconds}`];

/** Видео с видеорядом и звуком, как запись созвона; creationTime — дата записи в самом файле. */
export async function videoWithSound(file: string, seconds: number, creationTime?: string): Promise<void> {
  await runFfmpeg(resolveFfmpegPath(), [
    ...picture(seconds),
    ...tone(seconds),
    '-c:v',
    'mpeg4',
    '-c:a',
    'aac',
    ...(creationTime ? ['-metadata', `creation_time=${creationTime}`] : []),
    '-f',
    'mp4',
    file,
  ]);
}

/** Видео без звуковой дорожки. */
export async function videoWithoutSound(file: string, seconds: number): Promise<void> {
  await runFfmpeg(resolveFfmpegPath(), [...picture(seconds), '-c:v', 'mpeg4', '-f', 'mp4', file]);
}

/** Звук, как с диктофона телефона (AAC в M4A). */
export async function phoneRecording(file: string, seconds: number): Promise<void> {
  await runFfmpeg(resolveFfmpegPath(), [...tone(seconds), '-c:a', 'aac', '-f', 'ipod', file]);
}

/** Звук в кодеке, который нельзя переложить в Matroska как есть (Nellymoser в FLV): импорт его перекодирует. */
export async function oddCodecRecording(file: string, seconds: number): Promise<void> {
  await runFfmpeg(resolveFfmpegPath(), [...tone(seconds), '-ar', '22050', '-c:a', 'nellymoser', '-f', 'flv', file]);
}
