import { SchemaType } from '@google/generative-ai';

const DEFAULT_TRANSLATION_MODEL = process.env.GEMINI_READER_TRANSLATION_MODEL || 'gemini-2.5-flash';
const TRANSLATION_BATCH_SIZE = Math.max(
  10,
  Number.parseInt(process.env.GEMINI_READER_TRANSLATION_BATCH_SIZE || '30', 10) || 30,
);

function createTranslationError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function extractJson(text) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return '';
  }

  const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return normalized.slice(firstBrace, lastBrace + 1);
  }

  return normalized;
}

function normalizeSegments(segments) {
  return segments.map((segment, index) => ({
    index,
    text: String(segment?.text || '').trim(),
  }));
}

function normalizeLines(lines) {
  return lines.map((line, index) => ({
    index,
    text: String(line || '').trim(),
  }));
}

function normalizeTranslationInputs({ lines, segments }) {
  if (Array.isArray(lines) && lines.length) {
    return normalizeLines(lines);
  }

  if (Array.isArray(segments) && segments.length) {
    return normalizeSegments(segments);
  }

  throw createTranslationError('No reader lines were provided for translation.', 400);
}

function buildTranslationPrompt({ title, batch }) {
  return [
    'Translate each English reader line into natural, concise Russian for side-by-side reading.',
    'The goal is comprehension, not literary perfection.',
    'Preserve ordering and keep each translation aligned to its input line.',
    'Return only strict JSON with this shape: {"translations":[{"index":0,"text":"..."}]}',
    'Do not omit any line.',
    'Do not add commentary or markdown.',
    title ? `Chapter title: ${title}` : '',
    `Lines: ${JSON.stringify(batch)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function parseTranslationPayload(rawText) {
  try {
    return JSON.parse(extractJson(rawText));
  } catch {
    throw createTranslationError('Gemini returned translation data that was not valid JSON.', 502);
  }
}

function normalizeModelError(error) {
  const message = String(error?.message || '').trim();
  if (/429 Too Many Requests|quota exceeded/i.test(message)) {
    throw createTranslationError(
      'Translation quota is exhausted right now. Try again later or use another API key.',
      429,
    );
  }

  throw error;
}

function normalizeTranslationBatch(batch, payload) {
  const translations = Array.isArray(payload?.translations) ? payload.translations : [];
  const translationMap = new Map(
    translations.map((item) => {
      const explicitIndex = Number(item?.index);
      if (Number.isInteger(explicitIndex)) {
        return [explicitIndex, String(item?.text || '').trim()];
      }

      const fallbackEntry = Object.entries(item || {}).find(([key, value]) => /^index_\d+$/.test(key) && typeof value === 'string');
      if (fallbackEntry) {
        const matchedIndex = Number(fallbackEntry[0].slice('index_'.length));
        return [matchedIndex, String(fallbackEntry[1] || '').trim()];
      }

      return [Number.NaN, ''];
    }),
  );

  return batch.map((segment) => ({
    index: segment.index,
    text: translationMap.get(segment.index) || segment.text,
  }));
}

function buildTranslationSchema() {
  return {
    type: SchemaType.OBJECT,
    properties: {
      translations: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            index: { type: SchemaType.INTEGER },
            text: { type: SchemaType.STRING },
          },
          required: ['index', 'text'],
        },
      },
    },
    required: ['translations'],
  };
}

export async function translateSegmentsWithGemini({
  genAI,
  title,
  lines,
  segments,
  targetLanguage = 'Russian',
}) {
  const normalizedSegments = normalizeTranslationInputs({ lines, segments });
  const model = genAI.getGenerativeModel({
    model: DEFAULT_TRANSLATION_MODEL,
    systemInstruction: `You translate English reader segments into ${targetLanguage}. Keep meaning clear, concise, and easy to scan side by side.`,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: buildTranslationSchema(),
    },
  });

  const translatedSegments = [];

  for (const batch of chunkArray(normalizedSegments, TRANSLATION_BATCH_SIZE)) {
    try {
      const result = await model.generateContent(buildTranslationPrompt({ title, batch }));
      const payload = parseTranslationPayload(result?.response?.text());
      translatedSegments.push(...normalizeTranslationBatch(batch, payload));
    } catch (error) {
      normalizeModelError(error);
    }
  }

  if (translatedSegments.length !== normalizedSegments.length) {
    throw createTranslationError('Gemini translation response did not cover every reader segment.', 502);
  }

  return translatedSegments
    .sort((left, right) => left.index - right.index)
    .map((segment) => segment.text);
}
