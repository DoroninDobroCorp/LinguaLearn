// Gemini REST client for the conversation coach.
//
// The API keys are on the free tier, so every call goes through a key pool with
// per-(key, model) cooldowns and an ordered model fallback chain. Text models
// with heavy default thinking are far too slow for chat (30–90 s), so each task
// sets an explicit thinking effort.

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const API_BASE = String(process.env.COACH_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');

export const COACH_MODELS = {
  chat: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'],
  feedback: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'],
  // 3.5-flash often answers 503 under load; 2.5-flash gives a comparable
  // diagnosis in ~17 s, while 3.7-flash needs 60–90 s even at low thinking.
  analysis: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.7-flash'],
  workout: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.7-flash'],
  grade: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'],
  lesson: ['gemini-3.5-flash', 'gemini-2.5-flash'],
  utility: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'],
  // 2.5-flash keeps learner mistakes verbatim; gemini-3.5-transcribe silently
  // "fixes" them (de el → del), which would hide exactly what we analyse.
  stt: ['gemini-2.5-flash', 'gemini-3.5-flash'],
  // 3.1/2.5 TTS treat a leading style sentence as direction; the 3.8 TTS models
  // read it aloud, so they only get the bare text.
  tts: ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'],
};

const TTS_STYLE_MODELS = new Set(['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts']);
const NO_MINIMAL_THINKING = new Set(['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash']);

export class CoachAiError extends Error {
  constructor(message, { status = 502, code = 'AI_UNAVAILABLE', details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function parseKeys() {
  const raw = String(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').trim();
  return [...new Set(raw.split(/[,\s]+/).map((key) => key.trim()).filter(Boolean))];
}

const keys = parseKeys();
const cooldowns = new Map();
let rotation = 0;

export function isCoachAiConfigured() {
  return keys.length > 0;
}

export function getCoachApiKeys() {
  return keys.slice();
}

function cooldownKey(key, model) {
  return `${key.slice(-6)}|${model}`;
}

function isCooling(key, model) {
  const until = cooldowns.get(cooldownKey(key, model));
  return Boolean(until && until > Date.now());
}

function coolDown(key, model, ms) {
  cooldowns.set(cooldownKey(key, model), Date.now() + Math.max(5_000, Math.min(ms, 6 * 3600_000)));
}

function orderedKeys() {
  if (!keys.length) return [];
  rotation = (rotation + 1) % keys.length;
  return [...keys.slice(rotation), ...keys.slice(0, rotation)];
}

function parseRetryMs(errorBody) {
  const details = errorBody?.error?.details || [];
  for (const detail of details) {
    const delay = detail?.retryDelay;
    if (typeof delay === 'string') {
      const seconds = Number.parseFloat(delay);
      if (Number.isFinite(seconds)) return seconds * 1000;
    }
  }
  const message = String(errorBody?.error?.message || '');
  const match = message.match(/retry in ([\d.]+)\s*(h|m|s)?/i);
  if (match) {
    const value = Number.parseFloat(match[1]);
    const unit = (match[2] || 's').toLowerCase();
    return value * (unit === 'h' ? 3600_000 : unit === 'm' ? 60_000 : 1000);
  }
  return 60_000;
}

export function thinkingConfigFor(model, effort = 'none') {
  if (model.startsWith('gemini-2.5')) {
    const budget = { none: 0, low: 1024, medium: 4096 }[effort] ?? 0;
    return { thinkingBudget: budget };
  }
  if (model.startsWith('gemini-3')) {
    if (effort === 'none') {
      return { thinkingLevel: NO_MINIMAL_THINKING.has(model) ? 'low' : 'minimal' };
    }
    return { thinkingLevel: effort === 'medium' ? 'medium' : 'low' };
  }
  return undefined;
}

async function callModel({ model, key, body, timeoutMs }) {
  const url = `${API_BASE}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: response.status, data, raw: text };
}

/**
 * Run one generateContent request across the model chain and key pool.
 * `buildBody(model)` returns the request body for a given model so per-model
 * differences (thinking config, TTS style prompt) stay in the caller.
 */
export async function runWithFallback({ task, models, buildBody, timeoutMs = 30_000, extract }) {
  if (!keys.length) {
    throw new CoachAiError('Gemini API key is not configured on the server.', { status: 503, code: 'AI_NOT_CONFIGURED' });
  }
  const attempts = [];
  for (const model of models) {
    const candidates = orderedKeys().filter((key) => !isCooling(key, model));
    if (!candidates.length) {
      attempts.push(`${model}: all keys cooling down`);
      continue;
    }
    let body = buildBody(model);
    for (const key of candidates) {
      const startedAt = Date.now();
      try {
        let result = await callModel({ model, key, body, timeoutMs });
        if (result.status === 400 && /thinking level/i.test(result.data?.error?.message || '')) {
          body = { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingLevel: 'low' } } };
          result = await callModel({ model, key, body, timeoutMs });
        }
        if (result.status === 200) {
          const value = extract(result.data, model);
          if (value !== undefined && value !== null) {
            if (attempts.length) console.info(`[coach] ${task} served by ${model} after: ${attempts.join(' | ').slice(0, 300)}`);
            return { value, model, ms: Date.now() - startedAt };
          }
          const finish = result.data?.candidates?.[0]?.finishReason || result.data?.promptFeedback?.blockReason || 'EMPTY';
          attempts.push(`${model}: empty response (${finish})`);
          break; // Same prompt on another key would be empty too; try the next model.
        }
        const message = String(result.data?.error?.message || result.raw || '').slice(0, 200);
        attempts.push(`${model}: HTTP ${result.status} ${message}`);
        if (result.status === 429) {
          coolDown(key, model, parseRetryMs(result.data));
          continue;
        }
        if (result.status === 503 || result.status === 500) {
          coolDown(key, model, 20_000);
          continue;
        }
        break; // 4xx other than quota: the request itself is bad for this model.
      } catch (error) {
        attempts.push(`${model}: ${error.name === 'TimeoutError' ? `timeout after ${timeoutMs} ms` : error.message}`);
        break; // A timeout usually means the model is overloaded; move down the chain.
      }
    }
  }
  console.warn(`[coach] ${task} failed on every model:`, attempts.join(' | '));
  throw new CoachAiError('Нейросеть сейчас перегружена. Попробуйте ещё раз через минуту.', {
    status: 503,
    code: 'AI_UNAVAILABLE',
    details: { attempts },
  });
}

function textFromResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text).join('');
  return text.trim() ? text.trim() : null;
}

function parseJsonText(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function generateText({ task, models, system, contents, effort = 'none', temperature = 0.8, maxOutputTokens = 1024, timeoutMs = 30_000 }) {
  const { value, model, ms } = await runWithFallback({
    task,
    models,
    timeoutMs,
    buildBody: (modelName) => ({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens,
        thinkingConfig: thinkingConfigFor(modelName, effort),
      },
    }),
    extract: (data) => textFromResponse(data),
  });
  return { text: value, model, ms };
}

export async function generateJson({ task, models, system, contents, schema, effort = 'none', temperature = 0.4, maxOutputTokens = 4096, timeoutMs = 45_000 }) {
  const { value, model, ms } = await runWithFallback({
    task,
    models,
    timeoutMs,
    buildBody: (modelName) => ({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
        ...(schema ? { responseSchema: schema } : {}),
        thinkingConfig: thinkingConfigFor(modelName, effort),
      },
    }),
    extract: (data) => parseJsonText(textFromResponse(data)),
  });
  return { json: value, model, ms };
}

// ---------------------------------------------------------------- audio utils

async function withTempDir(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'coach-audio-'));
  try {
    return await fn(dir);
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const ALLOWED_INPUT_MIME = /^audio\/(webm|ogg|mp4|m4a|x-m4a|aac|mpeg|mp3|wav|x-wav|wave)(;.*)?$/i;

/**
 * Normalise a browser recording (webm/opus on Chrome, mp4/aac on Safari) into
 * 16 kHz mono MP3 and measure loudness, so near-silent clips never reach the
 * model (the model hallucinates plausible speech for silence or garbage).
 */
export async function normalizeRecording(base64, mimeType) {
  if (!ALLOWED_INPUT_MIME.test(String(mimeType || ''))) {
    throw new CoachAiError('Неподдерживаемый формат записи.', { status: 400, code: 'BAD_AUDIO_FORMAT' });
  }
  const input = Buffer.from(String(base64 || ''), 'base64');
  if (input.length < 800) {
    throw new CoachAiError('Запись слишком короткая.', { status: 400, code: 'AUDIO_TOO_SHORT' });
  }
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, 'input.bin');
    const outPath = path.join(dir, 'speech.mp3');
    await fs.promises.writeFile(inPath, input);
    let stderr = '';
    try {
      const result = await execFileAsync('ffmpeg', [
        '-hide_banner', '-nostdin', '-y', '-i', inPath,
        '-ac', '1', '-ar', '16000', '-af', 'volumedetect',
        '-c:a', 'libmp3lame', '-b:a', '32k', outPath,
      ], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
      stderr = result.stderr || '';
    } catch (error) {
      throw new CoachAiError('Не удалось обработать запись.', { status: 400, code: 'BAD_AUDIO', details: { message: String(error.stderr || error.message).slice(-300) } });
    }
    const duration = (() => {
      const match = stderr.match(/time=(\d+):(\d+):([\d.]+)/g);
      const last = match?.[match.length - 1]?.match(/time=(\d+):(\d+):([\d.]+)/);
      return last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : 0;
    })();
    const maxVolume = Number.parseFloat(stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1] ?? '-91');
    const meanVolume = Number.parseFloat(stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1] ?? '-91');
    const mp3 = await fs.promises.readFile(outPath);
    return { base64: mp3.toString('base64'), mimeType: 'audio/mp3', durationSec: duration, maxVolumeDb: maxVolume, meanVolumeDb: meanVolume };
  });
}

const STT_PROMPT = `Transcribe this audio VERBATIM. The speaker is a Russian-speaking woman learning Spanish (Rioplatense variety), level B1.
Rules:
- Write exactly what she says, keeping every grammatical mistake, wrong ending, wrong gender, missing article and wrong word. Never correct or improve anything.
- Keep self-corrections and repetitions; keep short fillers (eh, este, mmm) only when clearly audible.
- If she switches to Russian or English for a word, write that word as spoken in its own script (e.g. "чек").
- Use normal Spanish spelling and punctuation for what was said.
- If there is no intelligible speech, output exactly: [silencio]
Output only the transcript, nothing else.`;

export async function transcribeSpeech({ base64, mimeType }) {
  const { value, model } = await runWithFallback({
    task: 'stt',
    models: COACH_MODELS.stt,
    timeoutMs: 40_000,
    buildBody: (modelName) => ({
      contents: [{ role: 'user', parts: [{ text: STT_PROMPT }, { inlineData: { mimeType, data: base64 } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024, thinkingConfig: thinkingConfigFor(modelName, 'none') },
    }),
    extract: (data) => textFromResponse(data),
  });
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || /^\[?silencio\]?\.?$/i.test(text)) {
    return { text: '', model };
  }
  return { text, model };
}

// ------------------------------------------------------------------ TTS

const TTS_CACHE_DIR = process.env.COACH_TTS_CACHE_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'cache', 'coach-tts');

function wavFromPcm(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function cleanTextForSpeech(text) {
  return String(text || '')
    .replace(/\([^)]*[а-яё][^)]*\)/gi, ' ') // Russian glosses in parentheses are for reading only.
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .replace(/[*_#`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}

export async function synthesizeSpeech({ text, voice = 'Sulafat', style = 'rioplatense' }) {
  const spoken = cleanTextForSpeech(text);
  if (!spoken) {
    throw new CoachAiError('Нечего озвучивать.', { status: 400, code: 'EMPTY_TTS' });
  }
  const safeVoice = /^[A-Za-z]{2,24}$/.test(voice) ? voice : 'Sulafat';
  const hash = crypto.createHash('sha1').update(`${safeVoice}|${style}|${spoken}`).digest('hex');
  const cachePath = path.join(TTS_CACHE_DIR, `${hash}.mp3`);
  try {
    const cached = await fs.promises.readFile(cachePath);
    return { audio: cached, mimeType: 'audio/mpeg', cached: true };
  } catch {
    // Not cached yet.
  }

  const direction = style === 'formal'
    ? 'Leé en voz alta, con acento rioplatense de Buenos Aires, tono profesional y amable, ritmo claro:'
    : 'Leé en voz alta, con acento rioplatense de Buenos Aires (yeísmo rehilado, "sho"), tono cálido y natural, ritmo tranquilo:';

  const { value } = await runWithFallback({
    task: 'tts',
    models: COACH_MODELS.tts,
    timeoutMs: 40_000,
    buildBody: (modelName) => ({
      contents: [{ parts: [{ text: TTS_STYLE_MODELS.has(modelName) ? `${direction}\n${spoken}` : spoken }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } } },
      },
    }),
    extract: (data) => {
      const part = data?.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
      return part ? part.inlineData : null;
    },
  });

  const raw = Buffer.from(value.data, 'base64');
  const mime = String(value.mimeType || '').toLowerCase();
  const rate = Number.parseInt(mime.match(/rate=(\d+)/)?.[1] || '24000', 10);
  const wav = mime.includes('wav') ? raw : wavFromPcm(raw, rate);

  const mp3 = await withTempDir(async (dir) => {
    const inPath = path.join(dir, 'tts.wav');
    const outPath = path.join(dir, 'tts.mp3');
    await fs.promises.writeFile(inPath, wav);
    await execFileAsync('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', inPath, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', outPath], { timeout: 30_000 });
    return fs.promises.readFile(outPath);
  });

  await fs.promises.mkdir(TTS_CACHE_DIR, { recursive: true });
  await fs.promises.writeFile(cachePath, mp3).catch(() => {});
  return { audio: mp3, mimeType: 'audio/mpeg', cached: false };
}
