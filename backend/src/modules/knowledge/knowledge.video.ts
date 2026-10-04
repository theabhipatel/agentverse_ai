import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { logger } from '../../common/logger/index.js';
import { MAX_AUDIO_BYTES, transcribeAudio } from '../transcription/transcription.service.js';
import { KnowledgeProcessingError } from './knowledge.extract.js';
import type { SupportedVideoExtension } from './knowledge.constants.js';

const run = promisify(execFile);

// Speech does not need music quality. Mono, 16kHz and a low bitrate keep the
// compressed track a fraction of the source video's size, which is what lets
// almost any video fit in a single Whisper request instead of several.
const AUDIO_SAMPLE_RATE_HZ = 16000;
const AUDIO_BITRATE = '24k';

// ffmpeg cuts a chunk close to its target length, not to the exact byte, so the
// target stays under Whisper's real cap by this much.
const CHUNK_SAFETY_FACTOR = 0.85;
const MIN_CHUNK_SECONDS = 60;
// Repeated at the start of every chunk but the first, so a word spoken right on
// a cut is whole in at least one chunk.
const CHUNK_OVERLAP_SECONDS = 8;

/** ffmpeg's own message is a codec name or a byte offset, not something to show an admin. */
async function ffmpeg(args: string[]): Promise<void> {
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  } catch (error) {
    logger.warn({ err: error, args }, 'ffmpeg failed');
    throw new KnowledgeProcessingError(
      'This video could not be read. It may be damaged or use an unsupported codec.',
    );
  }
}

async function audioDurationSeconds(path: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path,
  ]);
  const seconds = Number.parseFloat(stdout);
  return Number.isFinite(seconds) ? seconds : 0;
}

/**
 * Pulls the audio out of a video and transcribes it. Whisper takes a file up to
 * MAX_AUDIO_BYTES, so a track that fits goes in one request; a longer one is cut
 * into overlapping pieces first, transcribed in order and joined.
 */
export async function extractVideoText(
  buffer: Buffer,
  extension: SupportedVideoExtension,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'agentverse-video-'));
  const videoPath = join(dir, `source.${extension}`);
  const audioPath = join(dir, 'audio.ogg');

  try {
    // Written to disk rather than piped: some phones place an mp4's index at the
    // end of the file, which a streamed pipe has not seen yet when ffmpeg looks
    // for it. A real file lets ffmpeg seek around it like any other player would.
    await writeFile(videoPath, buffer);
    await ffmpeg([
      '-i',
      videoPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      String(AUDIO_SAMPLE_RATE_HZ),
      '-c:a',
      'libopus',
      '-b:a',
      AUDIO_BITRATE,
      audioPath,
    ]);

    const duration = await audioDurationSeconds(audioPath);
    if (duration === 0) {
      throw new KnowledgeProcessingError('No audio track was found in this video.');
    }

    const { size } = await stat(audioPath);
    if (size <= MAX_AUDIO_BYTES) {
      return await transcribeAudio(await readFile(audioPath), 'audio/ogg');
    }

    return await transcribeInChunks(dir, audioPath, duration, size);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Splits the compressed track by time so each piece clears Whisper's size cap, with an overlap at every cut. */
async function transcribeInChunks(
  dir: string,
  audioPath: string,
  durationSeconds: number,
  totalBytes: number,
): Promise<string> {
  const bytesPerSecond = totalBytes / durationSeconds;
  const chunkSeconds = Math.max(
    MIN_CHUNK_SECONDS,
    Math.floor((MAX_AUDIO_BYTES * CHUNK_SAFETY_FACTOR) / bytesPerSecond),
  );

  const pieces: string[] = [];
  let start = 0;
  let index = 0;
  while (start < durationSeconds) {
    const overlap = index === 0 ? 0 : CHUNK_OVERLAP_SECONDS;
    const chunkPath = join(dir, `chunk-${index}.ogg`);
    await ffmpeg([
      '-ss',
      String(Math.max(0, start - overlap)),
      '-t',
      String(chunkSeconds + overlap),
      '-i',
      audioPath,
      '-c',
      'copy',
      chunkPath,
    ]);

    const text = await transcribeAudio(await readFile(chunkPath), 'audio/ogg');
    if (text) {
      pieces.push(text);
    }

    start += chunkSeconds;
    index += 1;
  }

  logger.info({ chunks: index, durationSeconds }, 'Video transcribed in chunks');
  return pieces.join(' ');
}
