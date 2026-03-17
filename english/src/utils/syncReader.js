const SENTENCE_SEGMENTER =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('en', { granularity: 'sentence' })
    : null;

function roundTime(value) {
  return Number(value.toFixed(3));
}

function normalizeWhitespace(value) {
  return value.replace(/\r\n/g, '\n').trim();
}

function createSegment(text, index, extra = {}) {
  return {
    id: `segment-${index}`,
    index,
    text,
    start: null,
    end: null,
    ...extra,
  };
}

export function generateProjectId() {
  return `reader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function splitTextIntoSegments(text, mode = 'paragraph') {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  if (mode === 'sentence') {
    const sentenceTexts = SENTENCE_SEGMENTER
      ? Array.from(SENTENCE_SEGMENTER.segment(normalized), (segment) => segment.segment.trim())
      : normalized
          .replace(/\n+/g, ' ')
          .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“‘(\[])/)
          .map((segment) => segment.trim());

    return sentenceTexts.filter(Boolean).map((segment, index) => createSegment(segment, index));
  }

  return normalized
    .split(/\n\s*\n+/)
    .map((segment) => segment.replace(/\n+/g, ' ').trim())
    .filter(Boolean)
    .map((segment, index) => createSegment(segment, index));
}

function normalizeAnchors(manualAnchors, segmentCount, duration) {
  const anchors = Object.entries(manualAnchors || {})
    .map(([index, time]) => ({
      index: Number(index),
      time: Number(time),
    }))
    .filter(
      (anchor) =>
        Number.isInteger(anchor.index) &&
        anchor.index >= 0 &&
        anchor.index <= segmentCount &&
        Number.isFinite(anchor.time) &&
        anchor.time >= 0 &&
        anchor.time <= duration,
    )
    .sort((left, right) => left.index - right.index || left.time - right.time);

  const normalized = [];

  for (const anchor of anchors) {
    const previous = normalized[normalized.length - 1];

    if (previous && anchor.index === previous.index) {
      normalized[normalized.length - 1] = anchor;
      continue;
    }

    if (!previous || anchor.time > previous.time) {
      normalized.push(anchor);
    }
  }

  if (!normalized.length || normalized[0].index !== 0) {
    normalized.unshift({ index: 0, time: 0 });
  }

  if (normalized[normalized.length - 1].index !== segmentCount) {
    normalized.push({ index: segmentCount, time: duration });
  }

  return normalized;
}

export function estimateSegmentBoundaries(segments, duration, manualAnchors = {}) {
  const normalizedSegments = segments.map((segment, index) => ({
    ...segment,
    index,
    manualAnchor: Number.isFinite(manualAnchors?.[index]),
  }));

  if (!Number.isFinite(duration) || duration <= 0 || !normalizedSegments.length) {
    return normalizedSegments.map((segment) => ({
      ...segment,
      start: null,
      end: null,
    }));
  }

  const anchors = normalizeAnchors(manualAnchors, normalizedSegments.length, duration);
  const nextSegments = normalizedSegments.map((segment) => ({ ...segment }));

  for (let boundaryIndex = 0; boundaryIndex < anchors.length - 1; boundaryIndex += 1) {
    const currentBoundary = anchors[boundaryIndex];
    const nextBoundary = anchors[boundaryIndex + 1];
    const intervalSegments = nextSegments.slice(currentBoundary.index, nextBoundary.index);

    if (!intervalSegments.length) {
      continue;
    }

    const intervalDuration = Math.max(nextBoundary.time - currentBoundary.time, 0);
    const totalWeight = intervalSegments.reduce((sum, segment) => sum + Math.max(segment.text.length, 1), 0);

    let cursor = currentBoundary.time;

    intervalSegments.forEach((segment, relativeIndex) => {
      const absoluteIndex = currentBoundary.index + relativeIndex;
      const weight = Math.max(segment.text.length, 1);
      const segmentDuration =
        relativeIndex === intervalSegments.length - 1
          ? nextBoundary.time - cursor
          : intervalDuration * (weight / totalWeight);

      nextSegments[absoluteIndex] = {
        ...segment,
        start: roundTime(cursor),
        end: roundTime(cursor + segmentDuration),
        manualAnchor: Number.isFinite(manualAnchors?.[absoluteIndex]),
      };

      cursor += segmentDuration;
    });
  }

  return nextSegments;
}

export function findSegmentIndexByTime(segments, time) {
  if (!Number.isFinite(time) || !segments.length) {
    return -1;
  }

  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const segment = segments[mid];

    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) {
      return -1;
    }

    if (time < segment.start) {
      high = mid - 1;
      continue;
    }

    if (time >= segment.end) {
      low = mid + 1;
      continue;
    }

    return mid;
  }

  if (time >= segments[segments.length - 1].end) {
    return segments.length - 1;
  }

  return -1;
}

export function formatTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '--:--';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseTimestamp(timestamp) {
  const match = timestamp.trim().match(/(?:(\d+):)?(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const milliseconds = Number((match[4] || '0').padEnd(3, '0'));

  return roundTime(hours * 3600 + minutes * 60 + seconds + milliseconds / 1000);
}

function finalizeTimedSegments(segments) {
  return segments
    .map((segment, index) => {
      const nextSegment = segments[index + 1];
      const end = Number.isFinite(segment.end)
        ? segment.end
        : Number.isFinite(nextSegment?.start)
          ? nextSegment.start
          : null;

      return createSegment(segment.text, index, {
        start: Number.isFinite(segment.start) ? roundTime(segment.start) : null,
        end: Number.isFinite(end) ? roundTime(end) : null,
        words: Array.isArray(segment.words) ? segment.words : undefined,
      });
    })
    .filter((segment) => segment.text);
}

function parseTimedBlocks(content) {
  const blocks = normalizeWhitespace(content)
    .replace(/^WEBVTT\s*/i, '')
    .split(/\n\s*\n+/);

  const segments = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      continue;
    }

    const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeLineIndex === -1) {
      continue;
    }

    const timeLine = lines[timeLineIndex];
    const [rawStart, rawEnd] = timeLine.split('-->').map((part) => part.trim());
    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(rawEnd);

    if (!Number.isFinite(start)) {
      continue;
    }

    const text = lines
      .slice(timeLineIndex + 1)
      .join(' ')
      .trim();

    if (!text) {
      continue;
    }

    segments.push({ text, start, end });
  }

  return finalizeTimedSegments(segments);
}

function parseTimedJson(content) {
  const parsed = JSON.parse(content);
  const rawSegments = Array.isArray(parsed) ? parsed : parsed?.segments;

  if (!Array.isArray(rawSegments)) {
    throw new Error('JSON timings must be an array or an object with a segments array.');
  }

  const segments = rawSegments
    .map((segment) => ({
      text: String(segment.text ?? segment.content ?? '').trim(),
      start: Number(segment.start ?? segment.begin ?? segment.from),
      end: Number(segment.end ?? segment.stop ?? segment.to),
      words: Array.isArray(segment.words)
        ? segment.words
            .map((word) => ({
              text: String(word.word ?? word.text ?? word.content ?? '').replace(/\r\n/g, '\n'),
              start: Number(word.start ?? word.begin ?? word.from),
              end: Number(word.end ?? word.stop ?? word.to),
            }))
            .filter(
              (word) =>
                word.text.trim() &&
                Number.isFinite(word.start) &&
                Number.isFinite(word.end) &&
                word.end >= word.start,
            )
        : undefined,
    }))
    .filter((segment) => segment.text && Number.isFinite(segment.start))
    .sort((left, right) => left.start - right.start);

  return finalizeTimedSegments(segments);
}

export function parseTimedTranscript(content, filename = '') {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return [];
  }

  const lowerCaseName = filename.toLowerCase();
  if (lowerCaseName.endsWith('.json')) {
    return parseTimedJson(normalized);
  }

  if (lowerCaseName.endsWith('.srt') || lowerCaseName.endsWith('.vtt') || normalized.includes('-->')) {
    return parseTimedBlocks(normalized);
  }

  throw new Error('Unsupported timings format. Use JSON, SRT, or VTT.');
}

export function exportSegmentsToJson(project) {
  return JSON.stringify(
    {
      title: project.title,
      timingMode: project.timingMode,
      segmentationMode: project.segmentationMode,
      bookmark: project.bookmark ?? null,
      segments: project.segments.map((segment) => ({
        text: segment.text,
        start: segment.start,
        end: segment.end,
        ...(Array.isArray(segment.words) && segment.words.length
          ? {
              words: segment.words.map((word) => ({
                text: word.text,
                start: word.start,
                end: word.end,
              })),
            }
          : {}),
      })),
    },
    null,
    2,
  );
}
