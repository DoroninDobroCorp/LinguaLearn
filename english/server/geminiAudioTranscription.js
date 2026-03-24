const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_GEMINI_AUDIO_MODEL = process.env.GEMINI_AUDIO_TRANSCRIBE_MODEL || 'gemini-3-flash-preview';
const MAX_GEMINI_AUDIO_SECONDS = 9.5 * 3600;

function createTranscriptionError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeMimeType(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'audio/mpeg';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'audio/mp3') {
    return 'audio/mpeg';
  }

  return normalized;
}

function buildGeminiUrl(pathname, apiKey) {
  return `${GEMINI_API_BASE_URL}${pathname}?key=${encodeURIComponent(apiKey)}`;
}

async function parseJsonResponse(response, fallbackMessage) {
  const rawBody = await response.text();
  let parsedBody = null;

  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsedBody = null;
  }

  if (!response.ok) {
    const errorMessage =
      parsedBody?.error?.message ||
      parsedBody?.message ||
      (rawBody && rawBody.trim()) ||
      fallbackMessage;
    throw createTranscriptionError(errorMessage, response.status || 502);
  }

  return parsedBody;
}

function parseGeminiFileResource(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (payload.file && typeof payload.file === 'object') {
    return payload.file;
  }

  return payload;
}

async function downloadRemoteAudio(audioUrl) {
  const response = await fetch(audioUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw createTranscriptionError('Failed to download the HPMOR audio file for transcription.', 502);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) {
    throw createTranscriptionError('The HPMOR audio file was empty.', 502);
  }

  return {
    bytes,
    mimeType: normalizeMimeType(response.headers.get('content-type')),
  };
}

async function startGeminiUpload({ apiKey, byteLength, mimeType, displayName }) {
  const response = await fetch(buildGeminiUrl('/upload/v1beta/files', apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(byteLength),
      'X-Goog-Upload-Header-Content-Type': mimeType,
    },
    body: JSON.stringify({
      file: {
        display_name: displayName,
      },
    }),
  });

  if (!response.ok) {
    const payload = await parseJsonResponse(response, 'Failed to start Gemini file upload.');
    throw createTranscriptionError(payload?.error?.message || 'Failed to start Gemini file upload.', response.status);
  }

  const uploadUrl = response.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw createTranscriptionError('Gemini did not return an upload URL for the audio file.', 502);
  }

  return uploadUrl;
}

async function uploadGeminiFile({ apiKey, bytes, mimeType, displayName }) {
  const uploadUrl = await startGeminiUpload({
    apiKey,
    byteLength: bytes.length,
    mimeType,
    displayName,
  });

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: bytes,
  });

  const payload = await parseJsonResponse(uploadResponse, 'Failed to upload the HPMOR audio file to Gemini.');
  const file = parseGeminiFileResource(payload);
  if (!file?.uri) {
    throw createTranscriptionError('Gemini upload finished without a usable file URI.', 502);
  }

  return file;
}

async function getGeminiFile({ apiKey, name }) {
  const response = await fetch(buildGeminiUrl(`/v1beta/${name}`, apiKey));
  const payload = await parseJsonResponse(response, 'Failed to read the uploaded Gemini file.');
  return parseGeminiFileResource(payload);
}

async function waitForGeminiFileActive({ apiKey, file }) {
  if (!file?.name) {
    return file;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = String(file.state || '').toUpperCase();
    if (!state || state === 'ACTIVE') {
      return file;
    }

    if (state === 'FAILED') {
      throw createTranscriptionError('Gemini could not process the uploaded HPMOR audio file.', 502);
    }

    await sleep(1500);
    file = await getGeminiFile({ apiKey, name: file.name });
  }

  throw createTranscriptionError('Gemini took too long to prepare the HPMOR audio file.', 504);
}

function formatClockTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseClockTime(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  const parts = normalized.split(':').map((part) => part.trim());
  if (parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

function buildWindowInstruction(estimatedWindow, audioDurationEstimate, restrictToWindow) {
  if (!restrictToWindow) {
    return '';
  }

  const startRatio = Number(estimatedWindow?.startRatio);
  const endRatio = Number(estimatedWindow?.endRatio);
  const duration = Number(audioDurationEstimate);

  if (!Number.isFinite(startRatio) || !Number.isFinite(endRatio) || !Number.isFinite(duration) || duration <= 0) {
    return '';
  }

  const startSeconds = Math.max(0, Math.floor(startRatio * duration) - 10);
  const endSeconds = Math.min(duration, Math.ceil(endRatio * duration) + 15);
  if (endSeconds - startSeconds < 5 || (startSeconds === 0 && endSeconds >= duration - 1)) {
    return '';
  }

  return `Transcribe only speech whose start time falls between ${formatClockTime(startSeconds)} and ${formatClockTime(
    endSeconds,
  )} of the full audio file. Ignore spoken content before or after that window.`;
}

function buildTranscriptionPrompt({ title, estimatedWindow, audioDurationEstimate, restrictToWindow }) {
  const windowInstruction = buildWindowInstruction(estimatedWindow, audioDurationEstimate, restrictToWindow);

  return [
    'Generate a faithful transcript of this audiobook audio as strict JSON.',
    'Return only JSON that matches the response schema.',
    'Use sequential segments for natural spoken phrases or sentences.',
    'Each segment must include start_timestamp, end_timestamp, and content.',
    'Timestamps must refer to the full audio file and use MM:SS or HH:MM:SS.',
    'Preserve the spoken English wording without summaries, speaker labels, markdown, or commentary.',
    'Include spoken podcast intros, chapter announcements, production notes, and outros when they are audible.',
    'Do not rewrite the transcript to match any source text or chapter page.',
    'Skip silence and music-only gaps.',
    title ? `Target chapter title: ${title}.` : '',
    windowInstruction,
  ]
    .filter(Boolean)
    .join('\n');
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function buildResponseSchema() {
  return {
    type: 'OBJECT',
    properties: {
      segments: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            start_timestamp: { type: 'STRING' },
            end_timestamp: { type: 'STRING' },
            content: { type: 'STRING' },
          },
          required: ['start_timestamp', 'end_timestamp', 'content'],
        },
      },
    },
    required: ['segments'],
  };
}

async function generateTranscriptWithGemini({
  apiKey,
  file,
  mimeType,
  title,
  estimatedWindow,
  audioDurationEstimate,
  restrictToWindow,
}) {
  const response = await fetch(
    buildGeminiUrl(`/v1beta/models/${encodeURIComponent(DEFAULT_GEMINI_AUDIO_MODEL)}:generateContent`, apiKey),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                file_data: {
                  file_uri: file.uri,
                  mime_type: mimeType,
                },
              },
              {
                text: buildTranscriptionPrompt({
                  title,
                  estimatedWindow,
                  audioDurationEstimate,
                  restrictToWindow,
                }),
              },
            ],
          },
        ],
        generation_config: {
          response_mime_type: 'application/json',
          response_schema: buildResponseSchema(),
        },
      }),
    },
  );

  const payload = await parseJsonResponse(response, 'Gemini transcription request failed.');
  const transcriptText = extractGeminiText(payload);
  if (!transcriptText) {
    throw createTranscriptionError('Gemini returned an empty transcript.', 502);
  }

  try {
    return JSON.parse(transcriptText);
  } catch {
    throw createTranscriptionError('Gemini returned transcript data that was not valid JSON.', 502);
  }
}

function normalizeTranscriptSegments(rawSegments, fallbackDuration) {
  if (!Array.isArray(rawSegments)) {
    throw createTranscriptionError('Gemini transcript payload did not contain a segments array.', 502);
  }

  const segments = rawSegments
    .map((segment) => {
      const text = String(segment?.content || '').replace(/\s+/g, ' ').trim();
      const start = parseClockTime(segment?.start_timestamp);
      const end = parseClockTime(segment?.end_timestamp);

      if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null;
      }

      return {
        text,
        start,
        end,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);

  if (!segments.length) {
    throw createTranscriptionError('Gemini did not return any usable transcript segments.', 502);
  }

  const duration = Number(fallbackDuration);
  return segments.map((segment, index) => {
    const nextSegment = segments[index + 1];
    const normalizedEnd = nextSegment ? Math.max(segment.end, nextSegment.start) : segment.end;

    return {
      text: segment.text,
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

export async function transcribeAudioWithGemini({
  audioUrl,
  title,
  estimatedWindow = null,
  audioDurationEstimate = null,
  restrictToWindow = false,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw createTranscriptionError('GEMINI_API_KEY is required for timed HPMOR transcription.', 500);
  }

  if (Number.isFinite(audioDurationEstimate) && audioDurationEstimate > MAX_GEMINI_AUDIO_SECONDS) {
    throw createTranscriptionError(
      'This HPMOR audio file is too long for Gemini timed transcription in one pass. Use a chapter episode or narrower episode group instead.',
      400,
    );
  }

  const { bytes, mimeType } = await downloadRemoteAudio(audioUrl);
  const uploadedFile = await waitForGeminiFileActive({
    apiKey,
    file: await uploadGeminiFile({
      apiKey,
      bytes,
      mimeType,
      displayName: title || 'HPMOR chapter audio',
    }),
  });

  const transcriptPayload = await generateTranscriptWithGemini({
    apiKey,
    file: uploadedFile,
    mimeType,
    title,
    estimatedWindow,
    audioDurationEstimate,
    restrictToWindow,
  });
  const segments = normalizeTranscriptSegments(transcriptPayload.segments, audioDurationEstimate);

  return {
    timingMode: 'timed',
    timingsName: `Gemini transcript · line timings (${DEFAULT_GEMINI_AUDIO_MODEL})`,
    text: segments.map((segment) => segment.text).join('\n\n'),
    segments,
    syncHint: 'LinguaLearn transcribed the official HPMOR audio as spoken and imported Gemini line timings.',
  };
}
