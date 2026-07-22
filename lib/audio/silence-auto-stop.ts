export interface SilenceAutoStopOptions {
  minRecordingMs: number;
  silenceDurationMs: number;
  silenceThreshold: number;
  maxRecordingMs: number;
}

export interface SilenceAutoStopSample {
  level: number;
  elapsedMs: number;
  nowMs: number;
}

export interface SilenceAutoStopDetector {
  shouldStop(sample: SilenceAutoStopSample): boolean;
}

export const DEFAULT_SILENCE_AUTO_STOP_OPTIONS: SilenceAutoStopOptions = {
  minRecordingMs: 800,
  silenceDurationMs: 1200,
  silenceThreshold: 0.015,
  maxRecordingMs: 60_000,
};

export function calculateRmsLevel(data: Uint8Array): number {
  if (data.length === 0) return 0;

  let sum = 0;
  for (const value of data) {
    const normalized = (value - 128) / 128;
    sum += normalized * normalized;
  }

  return Math.sqrt(sum / data.length);
}

export function createSilenceAutoStopDetector(
  options: SilenceAutoStopOptions,
): SilenceAutoStopDetector {
  let silenceStartedAt: number | null = null;

  return {
    shouldStop(sample: SilenceAutoStopSample): boolean {
      if (options.maxRecordingMs > 0 && sample.elapsedMs >= options.maxRecordingMs) {
        return true;
      }

      if (sample.elapsedMs < options.minRecordingMs) {
        silenceStartedAt = null;
        return false;
      }

      if (sample.level > options.silenceThreshold) {
        silenceStartedAt = null;
        return false;
      }

      if (silenceStartedAt === null) {
        silenceStartedAt = sample.nowMs;
        return false;
      }

      return sample.nowMs - silenceStartedAt >= options.silenceDurationMs;
    },
  };
}
