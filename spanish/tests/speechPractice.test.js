import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSupportedRecordingMimeType,
  getRecordingStartAvailability,
  getLocalSpanishPlaybackSupport,
  getSpeechPlaybackAvailability,
  getRecordingErrorMessage,
  getVoicePracticeSpanishContent,
  getVisibleSpanishContent,
  getVoicePracticeCapabilities,
  isExpectedSpeechSynthesisError,
  isLocalSpanishVoice,
  isMediaRecorderStateActive,
  selectBestSpanishVoice,
  shouldAbortRecordingStart,
  shouldStopSpeakingOnCardFlip,
  shouldStoreCompletedRecording,
} from '../src/utils/speechPractice.js';

describe('speech practice helpers', () => {
  it('prefers an exact Spanish locale voice when available', () => {
    const voices = [
      { name: 'English Default', lang: 'en-US', default: true, localService: true },
      { name: 'Spanish Mexico', lang: 'es-MX', default: false, localService: true },
      { name: 'Spanish Spain', lang: 'es-ES', default: false, localService: true },
    ];

    assert.equal(selectBestSpanishVoice(voices)?.name, 'Spanish Spain');
  });

  it('falls back to another Spanish voice when the preferred locale is absent', () => {
    const voices = [
      { name: 'English Default', lang: 'en-US', default: true, localService: true },
      { name: 'Español Latino', lang: 'es-419', default: false, localService: true },
    ];

    assert.equal(selectBestSpanishVoice(voices)?.lang, 'es-419');
  });

  it('only selects local Spanish voices for playback', () => {
    const voices = [
      { name: 'Spanish Spain Remote', lang: 'es-ES', default: false, localService: false },
      { name: 'Spanish Mexico Local', lang: 'es-MX', default: false, localService: true },
    ];

    assert.equal(selectBestSpanishVoice(voices)?.name, 'Spanish Mexico Local');
  });

  it('returns no voice when only remote Spanish voices are available', () => {
    const voices = [
      { name: 'Spanish Spain Remote', lang: 'es-ES', default: true, localService: false },
      { name: 'English Local', lang: 'en-US', default: false, localService: true },
    ];

    assert.equal(selectBestSpanishVoice(voices), null);
    assert.equal(isLocalSpanishVoice(voices[0]), false);
  });

  it('chooses the first supported recording mime type', () => {
    const supported = new Set(['audio/mp4', 'audio/ogg']);
    const mimeType = chooseSupportedRecordingMimeType((value) => supported.has(value));

    assert.equal(mimeType, 'audio/mp4');
  });

  it('reports when the browser has no local Spanish voice for playback', () => {
    assert.deepEqual(
      getLocalSpanishPlaybackSupport({
        ttsSupported: true,
        selectedVoice: null,
      }),
      {
        supported: false,
        message: 'Spanish playback needs a local Spanish voice installed in this browser.',
        reason: 'missing-local-spanish-voice',
      },
    );
  });

  it('returns empty mime type when support probing is unavailable', () => {
    assert.equal(chooseSupportedRecordingMimeType(null), '');
  });

  it('blocks synthesized playback while recording is active', () => {
    assert.deepEqual(
      getSpeechPlaybackAvailability({
        text: 'hola',
        ttsSupported: true,
        selectedVoice: { name: 'Spanish Spain', lang: 'es-ES', localService: true },
        isRecording: true,
        recorderState: 'recording',
      }),
      {
        allowed: false,
        message: 'Stop recording before listening in Spanish.',
        reason: 'recording',
        text: 'hola',
      },
    );
  });

  it('blocks synthesized playback while microphone setup is pending', () => {
    assert.deepEqual(
      getSpeechPlaybackAvailability({
        text: 'hola',
        ttsSupported: true,
        selectedVoice: { name: 'Spanish Spain', lang: 'es-ES', localService: true },
        isStarting: true,
      }),
      {
        allowed: false,
        message: 'Wait for microphone setup to finish before listening in Spanish.',
        reason: 'starting',
        text: 'hola',
      },
    );
  });

  it('blocks synthesized playback when no local Spanish voice is available', () => {
    assert.deepEqual(
      getSpeechPlaybackAvailability({
        text: 'hola',
        ttsSupported: true,
        selectedVoice: null,
      }),
      {
        allowed: false,
        message: 'Spanish playback needs a local Spanish voice installed in this browser.',
        reason: 'missing-local-spanish-voice',
        text: 'hola',
      },
    );
  });

  it('treats paused and recording MediaRecorder states as active', () => {
    assert.equal(isMediaRecorderStateActive('recording'), true);
    assert.equal(isMediaRecorderStateActive('paused'), true);
    assert.equal(isMediaRecorderStateActive('inactive'), false);
  });

  it('blocks a second recording start while microphone setup is already in flight', () => {
    assert.deepEqual(
      getRecordingStartAvailability({
        recordingSupported: true,
        hasWindow: true,
        hasNavigator: true,
        isRecording: false,
        isStarting: true,
      }),
      {
        allowed: false,
        busy: true,
        message: '',
        reason: 'starting',
      },
    );
  });

  it('reports browser capability combinations without touching globals', () => {
    const capabilities = getVoicePracticeCapabilities({
      speechSynthesis: {},
      SpeechSynthesisUtterance: function SpeechSynthesisUtterance() {},
      MediaRecorder: function MediaRecorder() {},
      mediaDevices: {
        getUserMedia() {},
      },
    });

    assert.deepEqual(capabilities, {
      speechSynthesisSupported: true,
      speechUtteranceSupported: true,
      mediaRecorderSupported: true,
      getUserMediaSupported: true,
      ttsSupported: true,
      recordingSupported: true,
    });
  });

  it('aborts stale recording startups after cancel or teardown invalidates the request', () => {
    assert.equal(
      shouldAbortRecordingStart({
        isMounted: true,
        startRequestId: 3,
        activeStartRequestId: 4,
      }),
      true,
    );
    assert.equal(
      shouldAbortRecordingStart({
        isMounted: false,
        startRequestId: 4,
        activeStartRequestId: 4,
      }),
      true,
    );
    assert.equal(
      shouldAbortRecordingStart({
        isMounted: true,
        startRequestId: 5,
        activeStartRequestId: 5,
      }),
      false,
    );
  });

  it('only exposes Spanish card text when that side is visible', () => {
    assert.deepEqual(
      getVisibleSpanishContent({
        direction: 'source_to_target',
        prompt: 'casa',
        answer: 'house',
      }, false),
      { text: 'casa', source: 'prompt' },
    );

    assert.deepEqual(
      getVisibleSpanishContent({
        direction: 'target_to_source',
        prompt: 'house',
        answer: 'casa',
      }, false),
      { text: '', source: null },
    );

    assert.deepEqual(
      getVisibleSpanishContent({
        direction: 'target_to_source',
        prompt: 'house',
        answer: 'casa',
      }, true),
      { text: 'casa', source: 'answer' },
    );
  });

  it('keeps reverse-card Spanish accessible while microphone setup or recording is busy', () => {
    assert.deepEqual(
      getVoicePracticeSpanishContent({
        card: {
          direction: 'target_to_source',
          prompt: 'house',
          answer: 'casa',
        },
        showAnswer: false,
        isStarting: true,
      }),
      { text: 'casa', source: 'answer' },
    );

    assert.deepEqual(
      getVoicePracticeSpanishContent({
        card: {
          direction: 'target_to_source',
          prompt: 'house',
          answer: 'casa',
        },
        showAnswer: false,
        isRecording: false,
        isStarting: false,
      }),
      { text: '', source: null },
    );
  });

  it('ignores expected speech synthesis cancellation errors', () => {
    assert.equal(isExpectedSpeechSynthesisError({ error: 'canceled' }), true);
    assert.equal(isExpectedSpeechSynthesisError({ error: 'cancelled' }), true);
    assert.equal(isExpectedSpeechSynthesisError({ error: 'interrupted' }), true);
    assert.equal(isExpectedSpeechSynthesisError({ error: 'audio-hardware' }), false);
  });

  it('stops speech before flipping away the only visible Spanish text', () => {
    assert.equal(
      shouldStopSpeakingOnCardFlip({
        card: {
          direction: 'target_to_source',
          prompt: 'house',
          answer: 'casa',
        },
        showAnswer: true,
        isSpeaking: true,
      }),
      true,
    );

    assert.equal(
      shouldStopSpeakingOnCardFlip({
        card: {
          direction: 'source_to_target',
          prompt: 'casa',
          answer: 'house',
        },
        showAnswer: true,
        isSpeaking: true,
      }),
      false,
    );

    assert.equal(
      shouldStopSpeakingOnCardFlip({
        card: {
          direction: 'target_to_source',
          prompt: 'house',
          answer: 'casa',
        },
        showAnswer: true,
        isSpeaking: false,
      }),
      false,
    );
  });

  it('maps permission-denied microphone errors to a friendly message', () => {
    assert.match(
      getRecordingErrorMessage({ name: 'NotAllowedError' }),
      /Microphone access was denied/i,
    );
  });

  it('stores completed recordings only while still mounted and not discarding', () => {
    assert.equal(
      shouldStoreCompletedRecording({
        chunkCount: 1,
        shouldDiscard: false,
        isMounted: true,
        hasUrlSupport: true,
      }),
      true,
    );
    assert.equal(
      shouldStoreCompletedRecording({
        chunkCount: 1,
        shouldDiscard: true,
        isMounted: true,
        hasUrlSupport: true,
      }),
      false,
    );
    assert.equal(
      shouldStoreCompletedRecording({
        chunkCount: 1,
        shouldDiscard: false,
        isMounted: false,
        hasUrlSupport: true,
      }),
      false,
    );
  });
});
