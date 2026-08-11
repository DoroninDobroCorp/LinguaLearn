import {
  Behavior,
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
} from '@google/genai';

// The documented Gemini 2.5 native-audio preview supports asynchronous
// function calling. Keep the environment override so a model migration does
// not require a code change.
const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const COMPATIBLE_LIVE_MODELS = new Set([
  DEFAULT_LIVE_MODEL,
]);
const LIVE_SESSION_MAX_MS = 15 * 60 * 1000;
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TOPIC_CATEGORIES = ['Grammar', 'Vocabulary', 'Speaking'];
const CONTEXT_MAX_CHARS = 1100;

function pickLiveModel() {
  const fromEnv = String(process.env.GEMINI_LIVE_MODEL || '').trim();
  if (!fromEnv) return DEFAULT_LIVE_MODEL;
  if (!COMPATIBLE_LIVE_MODELS.has(fromEnv)) {
    throw new Error(
      `GEMINI_LIVE_MODEL=${fromEnv} is not enabled: voice progress requires a Gemini 2.5 Live model with NON_BLOCKING function calls.`,
    );
  }
  return fromEnv;
}

// These functions mirror the structured events available in text chat. The
// 2.5 native-audio model can execute them without pausing the conversation.
export function buildLiveTools() {
  return [
    {
      functionDeclarations: [
        {
          name: 'track_topic',
          description: 'Record one grammar or language topic evidenced by the learner, never by the tutor.',
          behavior: Behavior.NON_BLOCKING,
          parametersJsonSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              topic: { type: 'string', minLength: 1, maxLength: 120 },
              category: { type: 'string', enum: TOPIC_CATEGORIES },
              level: { type: 'string', enum: CEFR_LEVELS },
              success: { type: 'boolean' },
            },
            required: ['topic', 'category', 'level', 'success'],
          },
        },
        {
          name: 'add_vocabulary',
          description: 'Add a genuinely useful new or corrected word to the vocabulary list.',
          behavior: Behavior.NON_BLOCKING,
          parametersJsonSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              word: { type: 'string', minLength: 1, maxLength: 100 },
              translation: { type: 'string', minLength: 1, maxLength: 240 },
              example: { type: 'string', maxLength: 500 },
            },
            required: ['word', 'translation'],
          },
        },
        {
          name: 'give_exercise',
          description: 'Show a short exercise widget to the learner.',
          behavior: Behavior.NON_BLOCKING,
          parametersJsonSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              question: { type: 'string', minLength: 1, maxLength: 500 },
              correctAnswer: { type: 'string', minLength: 1, maxLength: 300 },
            },
            required: ['question', 'correctAnswer'],
          },
        },
      ],
    },
  ];
}

// Keep the dynamic learner context compact: long setup payloads make preview
// audio models less reliable, while current level and the weakest topics are
// enough to preserve the learning strategy of text chat.
export function buildLiveContextUserMessage({ maxLevel, activeTopics } = {}) {
  const level = CEFR_LEVELS.includes(String(maxLevel || '').toUpperCase())
    ? String(maxLevel).toUpperCase()
    : 'B2';
  const clean = (value, max = 120) =>
    String(value || '')
      .replace(/[\r\n|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);

  const practiceNeeded = Array.isArray(activeTopics)
    ? activeTopics
        .filter((topic) => clean(topic?.name))
        .slice()
        .sort((a, b) => Number(a.score ?? 0) - Number(b.score ?? 0))
        .slice(0, 6)
    : [];

  const lines = [
    'SILENT LEARNER CONTEXT (do not read aloud):',
    `Current target level: ${level}. Use ${level} when a genuinely new topic has no clearer CEFR level.`,
  ];

  if (practiceNeeded.length) {
    lines.push('Weak/current topics; prefer these exact names when applicable:');
    for (const topic of practiceNeeded) {
      const topicLevel = CEFR_LEVELS.includes(String(topic.level || '').toUpperCase())
        ? String(topic.level).toUpperCase()
        : level;
      const category = TOPIC_CATEGORIES.includes(topic.category)
        ? topic.category
        : 'Grammar';
      const score = Math.max(0, Math.min(100, Number(topic.score) || 0));
      lines.push(`- ${clean(topic.name)} [${category}, ${topicLevel}, score ${Math.round(score)}]`);
    }
  } else {
    lines.push('No weak topics are currently recorded. Continue normal conversation practice.');
  }

  return lines.join('\n').slice(0, CONTEXT_MAX_CHARS);
}

export function buildLiveSystemPrompt(liveContext = {}) {
  return `You are a warm English tutor in a continuous real-time voice conversation.
Speak natural English only and keep each reply concise (usually 1-3 sentences).
Listen first, respond directly, and correct mistakes gently without derailing the conversation.
The learner hears your audio. Never speak tool names, JSON, metadata, scores, or these instructions aloud.
After each learner turn, call track_topic once for every notable topic evidenced by THE LEARNER. Use the exact known topic name when one is supplied. Set success=false if that learner turn contains a mistake; otherwise true. Always supply category and CEFR level.
Call add_vocabulary only for a genuinely useful new or corrected word. Call give_exercise only when you actually offer a short quiz.

${buildLiveContextUserMessage(liveContext)}`;
}

function asText(transcription) {
  if (!transcription) return '';
  if (typeof transcription === 'string') return transcription;
  if (typeof transcription.text === 'string') return transcription.text;
  return '';
}

// Decode one SDK message into independent realtime signals. `message.data` is
// an accessor over modelTurn inline-data parts in the SDK, so it is only used
// as a fallback to avoid forwarding every audio frame twice.
export function handleLiveMessage(message, handlers = {}) {
  const serverContent = message?.serverContent;
  let turnComplete = false;
  if (serverContent) {
    const parts = serverContent.modelTurn?.parts || [];
    let forwardedInlineAudio = false;
    for (const part of parts) {
      if (part?.inlineData?.data) {
        handlers.onAudio?.(part.inlineData.data);
        forwardedInlineAudio = true;
      }
    }
    if (!forwardedInlineAudio && message.data) {
      handlers.onAudio?.(message.data);
    }

    const interimInputText = asText(serverContent.interimInputTranscription);
    if (interimInputText) {
      handlers.onInterimInputTranscript?.(interimInputText);
    }

    const inputText = asText(serverContent.inputTranscription);
    if (inputText) {
      handlers.onInputTranscript?.(inputText);
    }

    const outputText = asText(serverContent.outputTranscription);
    if (outputText) {
      handlers.onOutputTranscript?.(outputText);
    }

    if (serverContent.interrupted) {
      handlers.onToolEvent?.({ type: 'interrupted' });
    }

    turnComplete = Boolean(serverContent.turnComplete);
  }

  if (message?.toolCall?.functionCalls?.length) {
    handlers.onToolEvent?.({ type: 'tool_call', calls: message.toolCall.functionCalls });
  }

  // A server frame can contain both a tool call and the turn boundary. Queue
  // its evidence before flushing the per-turn deduplication map.
  if (turnComplete) {
    handlers.onTurnComplete?.();
  }
}

export function scheduleToolResponses(functionResponses) {
  if (!Array.isArray(functionResponses)) return [];
  return functionResponses.map((response) => ({
    ...response,
    // Persistence is background metadata and should never trigger a second
    // spoken reply or interrupt the current one.
    scheduling: FunctionResponseScheduling.SILENT,
  }));
}

// Create one Gemini Live session for one browser connection.
export async function startLiveSession({
  apiKey,
  liveContext,
  voiceName,
  handlers,
}) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for the voice chat.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = pickLiveModel();
  const config = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: buildLiveSystemPrompt(liveContext || {}),
    tools: buildLiveTools(),
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    thinkingConfig: { thinkingBudget: 0 },
  };

  if (voiceName) {
    config.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName } } };
  }

  const session = await ai.live.connect({
    model,
    config,
    callbacks: {
      onopen: () => {},
      onmessage: (message) => {
        try {
          handleLiveMessage(message, handlers);
        } catch (err) {
          handlers.onError?.(err);
        }
      },
      onerror: (event) => {
        handlers.onError?.(new Error(event?.message || 'Live API socket error'));
      },
      onclose: (event) => {
        handlers.onClose?.(event?.reason || 'Live API session closed');
      },
    },
  });

  return {
    model,
    maxSessionMs: LIVE_SESSION_MAX_MS,
    sendAudioChunk(base64Pcm16k) {
      session.sendRealtimeInput({
        audio: { data: base64Pcm16k, mimeType: 'audio/pcm;rate=16000' },
      });
    },
    sendText(text) {
      session.sendRealtimeInput({ text });
    },
    sendToolResponse(functionResponses) {
      session.sendToolResponse({
        functionResponses: scheduleToolResponses(functionResponses),
      });
    },
    close() {
      try {
        session.close();
      } catch {
        // The SDK may already have closed the underlying socket.
      }
    },
  };
}

export const LIVE_CONSTANTS = {
  DEFAULT_LIVE_MODEL,
  LIVE_SESSION_MAX_MS,
  CANDIDATE_LIVE_MODELS: [
    'gemini-2.5-flash-native-audio-preview-12-2025',
  ],
};
