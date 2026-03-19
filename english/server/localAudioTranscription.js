import { spawn } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_LOCAL_WHISPER_MODEL = process.env.LOCAL_WHISPER_MODEL || 'small.en';
const LOCAL_ASR_PYTHON = process.env.LOCAL_ASR_PYTHON || join(__dirname, '..', '.venv-asr', 'bin', 'python');
const LOCAL_ASR_SCRIPT = join(__dirname, 'transcribe_audio.py');
const LOCAL_TRANSCRIPT_CACHE_DIR = join(__dirname, '.cache', 'reader-transcripts');

function createTranscriptionError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildWindowRange(estimatedWindow, audioDurationEstimate) {
  const startRatio = Number(estimatedWindow?.startRatio);
  const endRatio = Number(estimatedWindow?.endRatio);
  const duration = Number(audioDurationEstimate);

  if (!Number.isFinite(startRatio) || !Number.isFinite(endRatio) || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const start = Math.max(0, Math.floor(startRatio * duration) - 10);
  const end = Math.min(duration, Math.ceil(endRatio * duration) + 15);
  if (end - start < 5 || (start === 0 && end >= duration - 1)) {
    return null;
  }

  return {
    start,
    end,
  };
}

function normalizeTranscriptSegments(rawSegments, fallbackDuration) {
  if (!Array.isArray(rawSegments)) {
    throw createTranscriptionError('Local Whisper transcript payload did not contain a segments array.', 502);
  }

  const segments = rawSegments
    .map((segment) => {
      const text = String(segment?.text || '').replace(/\s+/g, ' ').trim();
      const start = Number(segment?.start);
      const end = Number(segment?.end);

      if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null;
      }

      const normalizedWords = Array.isArray(segment?.words)
        ? segment.words
            .map((word) => {
              const wordText = String(word?.text || '').trim();
              const wordStart = Number(word?.start);
              const wordEnd = Number(word?.end);
              if (!wordText || !Number.isFinite(wordStart) || !Number.isFinite(wordEnd) || wordEnd <= wordStart) {
                return null;
              }

              return {
                text: wordText,
                start: Number(wordStart.toFixed(3)),
                end: Number(wordEnd.toFixed(3)),
              };
            })
            .filter(Boolean)
        : null;

      return {
        text,
        start,
        end,
        ...(normalizedWords?.length ? { words: normalizedWords } : {}),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);

  if (!segments.length) {
    throw createTranscriptionError('Local Whisper did not return any usable transcript segments.', 502);
  }

  const duration = Number(fallbackDuration);
  return segments.map((segment, index) => {
    const nextSegment = segments[index + 1];
    const normalizedEnd = nextSegment ? Math.max(segment.end, nextSegment.start) : segment.end;

    return {
      ...segment,
      start: Number(segment.start.toFixed(3)),
      end: Number(
        Math.max(
          segment.start + 0.5,
          Number.isFinite(duration) && duration > 0 ? Math.min(duration, normalizedEnd) : normalizedEnd,
        ).toFixed(3),
      ),
    };
  });
}

function filterSegmentsToWindow(segments, windowRange) {
  if (!windowRange) {
    return segments;
  }

  return segments.filter((segment) => segment.end > windowRange.start && segment.start < windowRange.end);
}

function buildTranscriptCachePath(cacheSeed, modelName) {
  const cacheKey = createHash('sha1').update(JSON.stringify({ cacheSeed, modelName })).digest('hex');
  return join(LOCAL_TRANSCRIPT_CACHE_DIR, `${cacheKey}.json`);
}

async function readCachedTranscript(cachePath) {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeCachedTranscript(cachePath, payload) {
  await mkdir(LOCAL_TRANSCRIPT_CACHE_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(payload), 'utf8');
}

async function runLocalWhisper({ audioUrl, audioPath, modelName, includeWordTimestamps }) {
  if (!existsSync(LOCAL_ASR_PYTHON)) {
    throw createTranscriptionError(
      `Local Whisper runtime was not found at ${LOCAL_ASR_PYTHON}. Install english/.venv-asr first or set LOCAL_ASR_PYTHON.`,
      500,
    );
  }

  const args = [
    LOCAL_ASR_SCRIPT,
    '--model',
    modelName,
  ];

  if (audioUrl) {
    args.unshift('--audio-url', audioUrl);
  } else if (audioPath) {
    args.unshift('--audio-path', audioPath);
  } else {
    throw createTranscriptionError('Provide either an audio URL or an audio file for local transcription.', 400);
  }

  if (includeWordTimestamps) {
    args.push('--word-timestamps');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(LOCAL_ASR_PYTHON, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      reject(createTranscriptionError(error.message, 500));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          createTranscriptionError(
            stderr.trim() || stdout.trim() || 'Local Whisper transcription failed.',
            502,
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(
          createTranscriptionError(
            stderr.trim() || 'Local Whisper returned transcript data that was not valid JSON.',
            502,
          ),
        );
      }
    });
  });
}

async function writeTempAudioFile(audioBuffer, fileName = '') {
  const extensionMatch = String(fileName || '').match(/(\.[a-z0-9]{1,8})$/i);
  const extension = extensionMatch ? extensionMatch[1] : '.audio';
  const directory = await mkdtemp(join(tmpdir(), 'lingualearn-reader-'));
  const audioPath = join(directory, `${randomUUID()}${extension}`);
  await writeFile(audioPath, audioBuffer);
  return {
    directory,
    audioPath,
  };
}

function buildCacheSeed({ audioUrl, audioBuffer }) {
  if (audioUrl) {
    return { type: 'url', value: audioUrl };
  }

  if (audioBuffer) {
    return {
      type: 'buffer',
      sha1: createHash('sha1').update(audioBuffer).digest('hex'),
    };
  }

  return null;
}

export async function transcribeAudioLocally({
  audioUrl = '',
  audioBuffer = null,
  fileName = '',
  audioLabel = '',
  estimatedWindow = null,
  audioDurationEstimate = null,
  restrictToWindow = false,
}) {
  const modelName = DEFAULT_LOCAL_WHISPER_MODEL;
  const cacheSeed = buildCacheSeed({ audioUrl, audioBuffer });
  if (!cacheSeed) {
    throw createTranscriptionError('Provide an audio URL or uploaded audio file for local transcription.', 400);
  }

  const cachePath = buildTranscriptCachePath(cacheSeed, modelName);
  const cachedTranscript = await readCachedTranscript(cachePath);
  let transcriptPayload = cachedTranscript;

  if (!transcriptPayload) {
    if (audioUrl) {
      transcriptPayload = await runLocalWhisper({
        audioUrl,
        modelName,
        includeWordTimestamps: false,
      });
    } else {
      const { directory, audioPath } = await writeTempAudioFile(audioBuffer, fileName);
      try {
        transcriptPayload = await runLocalWhisper({
          audioPath,
          modelName,
          includeWordTimestamps: false,
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }

    await writeCachedTranscript(cachePath, transcriptPayload);
  }

  const fullSegments = normalizeTranscriptSegments(
    transcriptPayload.segments,
    audioDurationEstimate || transcriptPayload.duration,
  );
  const windowRange = restrictToWindow ? buildWindowRange(estimatedWindow, audioDurationEstimate) : null;
  const segments = filterSegmentsToWindow(fullSegments, windowRange);

  if (!segments.length) {
    throw createTranscriptionError('Local Whisper transcript did not overlap the expected chapter window.', 502);
  }

  const syncHint = windowRange
    ? 'LinguaLearn transcribed the wider HPMOR audio with local Whisper timings and kept the chapter window that matches this import.'
    : 'LinguaLearn transcribed the official HPMOR audio as spoken with local Whisper timings.';

  return {
    timingMode: 'timed',
    timingsName: `Local Whisper transcript · line timings (${modelName})`,
    text: segments.map((segment) => segment.text).join('\n\n'),
    segments,
    audioDurationEstimate: Number(audioDurationEstimate || transcriptPayload.duration || 0) || null,
    syncHint,
    audioLabel,
  };
}
