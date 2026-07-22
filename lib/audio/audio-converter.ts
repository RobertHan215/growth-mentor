/**
 * Audio Format Converter (Server-side only)
 *
 * Converts audio buffers to WAV format by spawning the system `ffmpeg` binary.
 * No extra npm packages required — relies on ffmpeg being installed on the host.
 *
 * In Docker (node:22-alpine), add to Dockerfile runner stage:
 *   RUN apk add --no-cache ffmpeg
 *
 * Typical conversion time: 100-500ms for 30s recordings.
 * Conversion runs fully in-memory (no temp files, no disk I/O).
 */

import { spawn } from 'child_process';
import { Readable } from 'stream';
import { createLogger } from '@/lib/logger';

const log = createLogger('AudioConverter');

/** Audio formats the third-party ASR API accepts natively — no conversion needed */
const NATIVE_FORMATS = new Set(['wav', 'mp3', 'amr']);

/**
 * Detect audio format from buffer magic bytes.
 * Returns a lower-case format string, or 'webm' as a safe default for unknown.
 */
function detectFormat(buffer: Buffer): string {
  if (buffer.length < 4) return 'webm';

  // WAV: RIFF....WAVE
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'wav';
  }
  // MP3: ID3 tag (0x49 0x44 0x33) or sync bytes (0xff 0xe*)
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return 'mp3';
  }
  // AMR: "#!AMR" magic
  if (
    buffer[0] === 0x23 &&
    buffer[1] === 0x21 &&
    buffer[2] === 0x41 &&
    buffer[3] === 0x4d
  ) {
    return 'amr';
  }
  // WebM / Matroska: EBML header (0x1a 0x45 0xdf 0xa3)
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'webm';
  }
  // OGG
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return 'ogg';
  }

  return 'webm'; // safe default
}

/**
 * Convert an audio buffer to WAV format using the system `ffmpeg` binary.
 *
 * If the input is already in a natively-supported format (wav/mp3/amr),
 * the original buffer is returned as-is with `converted: false`.
 *
 * Output WAV specs: PCM signed 16-bit little-endian, mono, 16 kHz.
 * (16 kHz is compatible with both 8k_zh and 16k_zh ASR modes.)
 *
 * @param audioBuffer - Input audio buffer (any format supported by ffmpeg)
 * @returns { buffer: Buffer, converted: boolean }
 * @throws If ffmpeg is not installed or conversion fails
 */
export async function convertToWav(audioBuffer: Buffer): Promise<{ buffer: Buffer; converted: boolean }> {
  const format = detectFormat(audioBuffer);

  // Already natively supported — skip conversion
  if (NATIVE_FORMATS.has(format)) {
    log.debug(`Audio format "${format}" is natively supported, skipping conversion`);
    return { buffer: audioBuffer, converted: false };
  }

  log.debug(`Converting audio from "${format}" to wav (16kHz mono PCM)`);
  const startMs = Date.now();

  return new Promise((resolve, reject) => {
    // ffmpeg: read from stdin, write wav to stdout
    const ff = spawn('ffmpeg', [
      '-f', format,
      '-i', 'pipe:0',         // read from stdin
      '-acodec', 'pcm_s16le', // PCM 16-bit signed little-endian
      '-ac', '1',             // mono
      '-ar', '16000',         // 16 kHz sample rate
      '-f', 'wav',
      'pipe:1',               // write to stdout
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const outputChunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];

    ff.stdout.on('data', (chunk: Buffer) => outputChunks.push(chunk));
    ff.stderr.on('data', (chunk: Buffer) => errorChunks.push(chunk));

    ff.on('error', (err) => {
      // Typically "ENOENT" — ffmpeg not installed
      reject(new Error(
        `ffmpeg not found or failed to start: ${err.message}. ` +
        `Install ffmpeg on the server (Docker: apk add ffmpeg; Linux: apt-get install ffmpeg).`
      ));
    });

    ff.on('close', (code) => {
      if (code !== 0) {
        const errMsg = Buffer.concat(errorChunks).toString().trim();
        reject(new Error(`ffmpeg exited with code ${code}: ${errMsg}`));
        return;
      }
      const result = Buffer.concat(outputChunks);
      log.debug(`Audio conversion done in ${Date.now() - startMs}ms, output size: ${result.length} bytes`);
      resolve({ buffer: result, converted: true });
    });

    // Write input buffer to ffmpeg stdin
    const inputStream = new Readable();
    inputStream.push(audioBuffer);
    inputStream.push(null);
    inputStream.pipe(ff.stdin);

    // Handle write errors (e.g. ffmpeg exits early)
    ff.stdin.on('error', () => {/* swallow — close event will report the real error */});
  });
}
