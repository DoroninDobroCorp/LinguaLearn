import { test, expect } from '@playwright/test';

const readerUrl = 'http://127.0.0.1:5173/english/reader';
const hpmorResetStorageKey = 'lingualearn-sync-reader-hpmor-reset-version';
const tinyAudioDataUrl =
  'data:audio/wav;base64,UklGRqQMAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YYAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

const timedTranscriptPayload = {
  segments: [
    {
      text: 'Hello world.',
      start: 0,
      end: 0.6,
      words: [
        { text: 'Hello', start: 0, end: 0.25 },
        { text: ' world.', start: 0.25, end: 0.6 },
      ],
    },
    {
      text: 'Next line.',
      start: 0.6,
      end: 1.2,
      words: [
        { text: 'Next', start: 0.6, end: 0.85 },
        { text: ' line.', start: 0.85, end: 1.2 },
      ],
    },
  ],
};

async function mockReadyChapter4Assets(page) {
  await page.route('**/english/reader-examples/chapter4-distil-large-v3-words.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(timedTranscriptPayload),
    });
  });
}

async function mockReadyChapter12Assets(page, options = {}) {
  const segments =
    options.segments ||
    [
      {
        text: 'Hello, and welcome to the Methods of Rationality podcast.',
        start: 0,
        end: 2.1,
      },
      {
        text: 'Chapter 12: Impulse Control',
        start: 2.1,
        end: 5.3,
      },
    ];
  const translations =
    options.translations ||
    [
      'Здравствуйте, и добро пожаловать на подкаст «Методы рациональности».',
      'Глава 12: Контроль импульсов',
    ];

  await page.route('**/english/reader-examples/chapter12-local-whisper-lines.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ segments }),
    });
  });

  await page.route('**/english/reader-examples/chapter12-local-whisper-lines.ru.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ translations }),
    });
  });
}

async function createTimedReaderProject(page, title = 'Timed transcript drill') {
  await page.goto(readerUrl, { waitUntil: 'networkidle' });

  await page.getByLabel('Project title').fill(title);
  await page.getByLabel('Audio URL').fill(tinyAudioDataUrl);
  await page.getByLabel('Optional timings (JSON, SRT, VTT)').setInputFiles({
    name: 'timed-transcript.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(timedTranscriptPayload)),
  });
  await page.getByRole('button', { name: 'Create Reader Project' }).click();

  await expect(page.getByText(new RegExp(`Loaded "${title}" with a timed transcript`))).toBeVisible();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test('creates a custom reader project from pasted text and audio', async ({ page }) => {
  await page.goto(readerUrl, { waitUntil: 'networkidle' });

  await page.getByLabel('Project title').fill('Playwright reader drill');
  await page
    .getByPlaceholder('Paste chapter text here, or upload a .txt/.md file below.')
    .fill('First shadowing line. Second shadowing line.');
  await page.getByLabel('Audio URL').fill(tinyAudioDataUrl);
  await page.getByLabel('Segmentation mode').selectOption('sentence');
  await page.getByRole('button', { name: 'Create Reader Project' }).click();

  await expect(page.getByText(/Loaded "Playwright reader drill" with rough sync/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Playwright reader drill' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Playwright reader drill/ })).toBeVisible();
  await expect(page.getByText('First shadowing line.').first()).toBeVisible();
  await expect(page.getByText('Second shadowing line.').first()).toBeVisible();
  await expect(page.getByText('0 manual pins')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Follow playback: off' })).toBeVisible();
});

test('creates a timed reader project by transcribing an audio URL locally', async ({ page }) => {
  await page.route('**/english/api/reader/transcribe-url', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        timingMode: 'timed',
        timingsName: 'Local Whisper transcript · line timings (small.en)',
        text: 'Hello there.\n\nGeneral Kenobi.',
        audioDurationEstimate: 12,
        segments: [
          {
            text: 'Hello there.',
            start: 0,
            end: 1.2,
          },
          {
            text: 'General Kenobi.',
            start: 1.2,
            end: 2.8,
          },
        ],
        syncHint: 'LinguaLearn transcribed the official HPMOR audio as spoken with local Whisper timings.',
      }),
    });
  });

  await page.goto(readerUrl, { waitUntil: 'networkidle' });
  await page.getByLabel('Project title').fill('Local ASR drill');
  await page.getByLabel('Audio URL').fill(tinyAudioDataUrl);
  await page.getByRole('button', { name: 'Transcribe Audio Locally' }).click();

  await expect(page.getByRole('heading', { name: 'Local ASR drill' })).toBeVisible();
  await expect(page.getByText(/Loaded "Local ASR drill" with a local timed transcript/)).toBeVisible();
  await expect(page.getByText('Hello there.').first()).toBeVisible();
  await expect(page.getByText('General Kenobi.').first()).toBeVisible();
  await expect(page.getByText('Exact line timings are loaded.').first()).toBeVisible();
});

test('shows a progress bar while local transcription is running', async ({ page }) => {
  await page.route('**/english/api/reader/transcribe-url', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        timingMode: 'timed',
        timingsName: 'Local Whisper transcript · line timings (small.en)',
        text: 'Delayed line.',
        audioDurationEstimate: 6,
        segments: [
          {
            text: 'Delayed line.',
            start: 0,
            end: 1.5,
          },
        ],
        syncHint: 'LinguaLearn transcribed the official HPMOR audio as spoken with local Whisper timings.',
      }),
    });
  });

  await page.goto(readerUrl, { waitUntil: 'networkidle' });
  await page.getByLabel('Project title').fill('Delayed ASR drill');
  await page.getByLabel('Audio URL').fill(tinyAudioDataUrl);
  await page.getByRole('button', { name: 'Transcribe Audio Locally' }).click();

  await expect(page.getByTestId('reader-progress')).toBeVisible();
  await expect(page.getByTestId('reader-progress')).toContainText('Transcribing audio locally');
  await expect(page.getByTestId('reader-progress')).toContainText('Processing on the server');
  await expect(page.getByRole('heading', { name: 'Delayed ASR drill' })).toBeVisible();
  await expect(page.getByTestId('reader-progress')).toHaveCount(0);
});

test('falls back to /api translation when /english/api returns HTML', async ({ page }) => {
  await createTimedReaderProject(page, 'Translation fallback drill');

  await page.route('**/english/api/reader/translate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><body>fallback</body></html>',
    });
  });

  await page.route('**/api/reader/translate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        translations: ['Привет, мир.', 'Следующая строка.'],
      }),
    });
  });

  await page.getByRole('button', { name: 'Open EN/RU reader' }).click();

  await expect(page.getByText('Привет, мир.').first()).toBeVisible();
  await expect(page.getByText('Следующая строка.').first()).toBeVisible();
});

test('falls back to direct backend translation when proxy paths return HTML', async ({ page }) => {
  await createTimedReaderProject(page, 'Direct backend translation fallback drill');

  await page.route('**/english/api/reader/translate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><body>english proxy fallback</body></html>',
    });
  });

  await page.route('**/api/reader/translate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><body>root proxy fallback</body></html>',
    });
  });

  await page.route('http://127.0.0.1:3001/api/reader/translate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        translations: ['Привет, мир.', 'Следующая строка.'],
      }),
    });
  });

  await page.getByRole('button', { name: 'Open EN/RU reader' }).click();

  await expect(page.getByText('Привет, мир.').first()).toBeVisible();
  await expect(page.getByText('Следующая строка.').first()).toBeVisible();
});

test('requests translation as the same visible English lines', async ({ page }) => {
  await createTimedReaderProject(page, 'Line aligned translation drill');

  let translationPayload = null;
  await page.route('**/english/api/reader/translate', async (route) => {
    translationPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        translations: ['Привет, мир.', 'Следующая строка.'],
      }),
    });
  });

  await page.getByRole('button', { name: 'Open EN/RU reader' }).click();

  await expect(page.getByText('Привет, мир.').first()).toBeVisible();
  expect(translationPayload).toEqual({
    title: 'Line aligned translation drill',
    lines: ['Hello world.', 'Next line.'],
  });
});

test('opens ready chapter 12 with prepared Russian translation and no API call', async ({ page }) => {
  await mockReadyChapter12Assets(page);

  let translationApiCalls = 0;
  await page.route('**/reader/translate', async (route) => {
    translationApiCalls += 1;
    await route.abort();
  });

  await page.goto(readerUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open ready chapter 12' }).click();

  await expect(page.getByRole('heading', { name: 'HPMOR Chapter 12 · Ready reader' })).toBeVisible();
  await page.getByRole('button', { name: 'Open EN/RU reader' }).click();

  await expect(page.getByText('Здравствуйте, и добро пожаловать на подкаст «Методы рациональности».').first()).toBeVisible();
  await expect(page.getByText('Глава 12: Контроль импульсов').first()).toBeVisible();
  expect(translationApiCalls).toBe(0);
});

test('syncs bilingual scrolling in both directions', async ({ page }) => {
  const segments = Array.from({ length: 36 }, (_, index) => ({
    text: `English line ${index + 1}. ${'More text. '.repeat((index % 3) + 2)}`,
    start: index * 2,
    end: index * 2 + 2,
  }));
  const translations = segments.map(
    (_, index) => `Русская строка ${index + 1}. ${'Больше текста. '.repeat((index % 4) + 3)}`,
  );

  await mockReadyChapter12Assets(page, { segments, translations });

  await page.goto(readerUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open ready chapter 12' }).click();
  await page.getByRole('button', { name: 'Open EN/RU reader' }).click();

  await expect(page.getByTestId('split-english-scroll')).toBeVisible();
  await expect(page.getByTestId('split-translation-scroll')).toBeVisible();

  await page.evaluate(() => {
    const element = document.querySelector('[data-testid="split-english-scroll"]');
    element.scrollTop = 700;
    element.dispatchEvent(new Event('scroll'));
  });

  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="split-translation-scroll"]');
    return element && element.scrollTop > 0;
  });

  const englishScrollAfterFirstMove = await page.getByTestId('split-english-scroll').evaluate((element) => element.scrollTop);
  const translationScrollAfterFirstMove = await page
    .getByTestId('split-translation-scroll')
    .evaluate((element) => element.scrollTop);

  expect(englishScrollAfterFirstMove).toBeGreaterThan(0);
  expect(translationScrollAfterFirstMove).toBeGreaterThan(0);

  await page.evaluate(() => {
    const element = document.querySelector('[data-testid="split-translation-scroll"]');
    element.scrollTop = 1200;
    element.dispatchEvent(new Event('scroll'));
  });

  await page.waitForFunction((previousEnglishTop) => {
    const element = document.querySelector('[data-testid="split-english-scroll"]');
    return element && element.scrollTop > previousEnglishTop;
  }, englishScrollAfterFirstMove);
});

test('resets stale HPMOR chapter imports while keeping manual projects', async ({ page }) => {
  await page.goto(readerUrl, { waitUntil: 'networkidle' });

  await page.evaluate(
    async ({ resetKey, audioUrl }) => {
      const database = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open('lingualearn-sync-reader', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      const now = new Date().toISOString();
      const transaction = database.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');

      store.put({
        id: 'manual-project',
        title: 'Manual project',
        rawText: 'Manual text stays.',
        segmentationMode: 'paragraph',
        timingMode: 'estimated',
        audioUrl,
        audioBlob: null,
        audioName: 'Manual audio',
        textName: 'Manual text',
        timingsName: null,
        manualAnchors: {},
        estimatedWindow: null,
        segments: [{ text: 'Manual text stays.', start: 0, end: 1 }],
        audioDuration: 1,
        needsSync: false,
        needsInitialSeek: false,
        createdAt: now,
        updatedAt: now,
      });

      store.put({
        id: 'hpmor-project',
        title: 'Chapter 3: Comparing Reality To Its Alternatives',
        rawText: 'HPMOR text should be purged.',
        segmentationMode: 'sentence',
        timingMode: 'estimated',
        audioUrl,
        audioBlob: null,
        audioName: 'HPMOR audio',
        textName: 'HPMOR chapter 3',
        timingsName: 'Estimated',
        manualAnchors: {},
        estimatedWindow: { startRatio: 0.4, endRatio: 1 },
        segments: [{ text: 'HPMOR text should be purged.', start: 0.4, end: 1 }],
        audioDuration: 1,
        needsSync: false,
        needsInitialSeek: false,
        source: 'hpmor',
        sourceChapterNumber: 3,
        createdAt: now,
        updatedAt: now,
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });

      database.close();
      window.localStorage.removeItem(resetKey);
    },
    { resetKey: hpmorResetStorageKey, audioUrl: tinyAudioDataUrl },
  );

  await page.reload({ waitUntil: 'networkidle' });

  await expect(page.getByText(/Removed old HPMOR chapter imports/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Manual project/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chapter 3:/ })).toHaveCount(0);
});

test('imports an HPMOR chapter via mocked backend response', async ({ page }) => {
  await page.route('**/english/api/reader/hpmor/chapter/7', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        chapterNumber: 7,
        title: 'Chapter 7: The Stanford Prison Experiment',
        text: 'Harry stepped forward. Draco hesitated. Hermione watched.',
        audioUrl: tinyAudioDataUrl,
        audioDurationEstimate: 180,
        audioLabel: 'HPMOR audiobook part 1',
        audioSourceType: 'episode-group',
        estimatedWindow: {
          startRatio: 0.133,
          endRatio: 0.217,
        },
        estimatedRange: {
          start: 24,
          end: 39,
        },
        syncHint:
          'LinguaLearn found a narrow HPMOR podcast episode group, so the import should stay much tighter than the full audiobook part.',
        source: 'hpmor',
      }),
    });
  });

  await page.goto(readerUrl, { waitUntil: 'networkidle' });

  await page.getByPlaceholder('Chapter number').fill('7');
  await page.getByRole('button', { name: 'Import chapter' }).click();

  await expect(page.getByRole('heading', { name: 'Chapter 7: The Stanford Prison Experiment' })).toBeVisible();
  await expect(page.getByText('HPMOR audiobook part 1')).toBeVisible();
  await expect(page.getByText('Harry stepped forward.').first()).toBeVisible();
  await expect(page.getByText('0 manual pins')).toBeVisible();
  await expect(page.getByText(/stay much tighter than the full audiobook part/).first()).toBeVisible();
});

test('imports a timed HPMOR chapter via mocked backend response', async ({ page }) => {
  await page.route('**/english/api/reader/hpmor/chapter/12', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        chapterNumber: 12,
        title: 'Chapter 12: Impulse Control',
        text:
          'Hello, and welcome to the Methods of Rationality podcast.\n\nChapter 12: Impulse Control\n\n"Wonder what\'s wrong with him."',
        audioUrl: tinyAudioDataUrl,
        audioDurationEstimate: 90,
        audioLabel: 'HPMOR podcast episode · chapter 12',
        audioSourceType: 'episode',
        timingMode: 'timed',
        timingsName: 'Local Whisper transcript · line timings (small.en)',
        segments: [
          {
            text: 'Hello, and welcome to the Methods of Rationality podcast.',
            start: 0,
            end: 2.1,
          },
          {
            text: 'Chapter 12: Impulse Control',
            start: 2.1,
            end: 5.3,
          },
          {
            text: '"Wonder what\'s wrong with him."',
            start: 5.3,
            end: 7.9,
          },
        ],
        syncHint: 'LinguaLearn transcribed the official HPMOR audio as spoken with local Whisper timings.',
        source: 'hpmor',
      }),
    });
  });

  await page.goto(readerUrl, { waitUntil: 'networkidle' });

  await page.getByPlaceholder('Chapter number').fill('12');
  await page.getByRole('button', { name: 'Import chapter' }).click();

  await expect(page.getByRole('heading', { name: 'Chapter 12: Impulse Control' })).toBeVisible();
  await expect(page.getByText(/Exact line timings are loaded/).first()).toBeVisible();
  await expect(page.getByText('Hello, and welcome to the Methods of Rationality podcast.').first()).toBeVisible();
  await expect(page.getByText('"Wonder what\'s wrong with him."').first()).toBeVisible();
  await expect(page.getByText(/transcribed the official HPMOR audio as spoken with local Whisper timings/).first()).toBeVisible();
});

test('re-importing the same HPMOR chapter replaces the existing library item', async ({ page }) => {
  let importCount = 0;

  await page.route('**/english/api/reader/hpmor/chapter/7', async (route) => {
    importCount += 1;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        chapterNumber: 7,
        title: 'Chapter 7: The Stanford Prison Experiment',
        text:
          importCount === 1
            ? 'Harry stepped forward. Draco hesitated. Hermione watched.'
            : 'Harry stepped forward again. Draco answered this time. Hermione kept notes.',
        audioUrl: tinyAudioDataUrl,
        audioDurationEstimate: 180,
        audioLabel: 'HPMOR audiobook part 1',
        audioSourceType: 'episode-group',
        estimatedWindow: {
          startRatio: 0.133,
          endRatio: 0.217,
        },
        estimatedRange: {
          start: 24,
          end: 39,
        },
        syncHint:
          'LinguaLearn found a narrow HPMOR podcast episode group, so the import should stay much tighter than the full audiobook part.',
        source: 'hpmor',
      }),
    });
  });

  await page.goto(readerUrl, { waitUntil: 'networkidle' });

  await page.getByPlaceholder('Chapter number').fill('7');
  await page.getByRole('button', { name: 'Import chapter' }).click();
  await expect(page.getByText('Harry stepped forward.').first()).toBeVisible();

  await page.getByRole('button', { name: 'Import chapter' }).click();

  await expect(page.getByText('Harry stepped forward again.').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Chapter 7: The Stanford Prison Experiment' }),
  ).toHaveCount(1);
});

test('shows continuous timed text with current word highlight and a shared bookmark', async ({ page }) => {
  await createTimedReaderProject(page);

  await expect(page.getByRole('heading', { name: 'Reader text' })).toBeVisible();
  await expect(page.getByTestId('reader-line-0')).toContainText('Hello world.');
  await expect(page.getByTestId('reader-line-1')).toContainText('Next line.');

  await page.locator('audio').evaluate((audio) => {
    audio.dataset.mockCurrentTime = '0';
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() {
        return Number(this.dataset.mockCurrentTime || '0');
      },
      set(value) {
        this.dataset.mockCurrentTime = String(value);
      },
    });
  });

  await page.locator('audio').evaluate((audio) => {
    audio.currentTime = 0.35;
    audio.dispatchEvent(new Event('timeupdate'));
  });

  await expect(page.getByTestId('reader-line-0')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('active-word')).toHaveText('world.');

  await page.getByRole('button', { name: 'Save shared bookmark' }).click();
  await expect(page.getByText(/Saved a shared bookmark at/)).toBeVisible();
  await expect(page.getByTestId('shared-bookmark-time')).not.toHaveText('No bookmark yet');

  await page.locator('audio').evaluate((audio) => {
    audio.currentTime = 0.9;
    audio.dispatchEvent(new Event('timeupdate'));
  });

  await expect(page.getByTestId('reader-line-1')).toHaveAttribute('data-active', 'true');

  await page.getByRole('button', { name: 'Jump to bookmark' }).first().click();

  await expect(page.getByTestId('reader-line-0')).toHaveAttribute('data-selected', 'true');
  const jumpedTime = await page.locator('audio').evaluate((audio) => audio.currentTime);
  expect(jumpedTime).toBeLessThan(0.5);
});

test('toggles audio with the spacebar outside input fields', async ({ page }) => {
  await createTimedReaderProject(page, 'Keyboard controls drill');

  await page.locator('audio').evaluate((audio) => {
    audio.dataset.pausedState = 'true';
    audio.play = async () => {
      audio.dataset.pausedState = 'false';
    };
    audio.pause = () => {
      audio.dataset.pausedState = 'true';
    };

    Object.defineProperty(audio, 'paused', {
      configurable: true,
      get() {
        return this.dataset.pausedState !== 'false';
      },
    });
  });

  await page.getByRole('heading', { name: 'Keyboard controls drill' }).click();
  await page.keyboard.press('Space');
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => audio.dataset.pausedState))
    .toBe('false');

  await page.keyboard.press('Space');
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => audio.dataset.pausedState))
    .toBe('true');
});

test('switching projects saves progress for the project you were listening to', async ({ page }) => {
  await createTimedReaderProject(page, 'First progress drill');
  await createTimedReaderProject(page, 'Second progress drill');

  await page.getByRole('button', { name: /First progress drill/ }).click();
  await page.locator('audio').evaluate((audio) => {
    audio.dataset.mockCurrentTime = '0';
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() {
        return Number(this.dataset.mockCurrentTime || '0');
      },
      set(value) {
        this.dataset.mockCurrentTime = String(value);
      },
    });
  });

  await page.locator('audio').evaluate((audio) => {
    audio.currentTime = 1.05;
    audio.dispatchEvent(new Event('timeupdate'));
  });

  await page.getByRole('button', { name: /Second progress drill/ }).click();
  await expect(page.getByRole('button', { name: /First progress drill/ })).toContainText('Resume from 00:01');
});

test('scrubbing and switching projects restores the correct line', async ({ page }) => {
  await createTimedReaderProject(page, 'First scrub drill');
  await createTimedReaderProject(page, 'Second scrub drill');

  await page.getByRole('button', { name: /First scrub drill/ }).click();
  await page.locator('audio').evaluate((audio) => {
    audio.dataset.mockCurrentTime = '0';
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() {
        return Number(this.dataset.mockCurrentTime || '0');
      },
      set(value) {
        this.dataset.mockCurrentTime = String(value);
      },
    });
  });

  await page.locator('audio').evaluate((audio) => {
    audio.currentTime = 1.05;
  });

  await page.getByRole('button', { name: /Second scrub drill/ }).click();
  await page.getByRole('button', { name: /First scrub drill/ }).click();

  await page.locator('audio').evaluate((audio) => {
    audio.dataset.mockCurrentTime = '0';
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() {
        return Number(this.dataset.mockCurrentTime || '0');
      },
      set(value) {
        this.dataset.mockCurrentTime = String(value);
      },
    });
    Object.defineProperty(audio, 'duration', {
      configurable: true,
      get() {
        return 10;
      },
    });
    audio.dispatchEvent(new Event('loadedmetadata'));
  });

  await expect(page.getByTestId('reader-line-1')).toHaveAttribute('data-active', 'true');
});

test('switching from a paused active project still saves the first pause on the newly selected project', async ({ page }) => {
  await createTimedReaderProject(page, 'Paused source drill');
  await createTimedReaderProject(page, 'Paused target drill');

  await expect(page.getByRole('heading', { name: 'Paused target drill' })).toBeVisible();
  await page.getByRole('button', { name: /Paused source drill/ }).click();
  await expect(page.getByRole('heading', { name: 'Paused source drill' })).toBeVisible();
  await page.getByRole('button', { name: /Paused target drill/ }).click();
  await page.locator('audio').evaluate((audio) => {
    audio.dataset.mockCurrentTime = '0';
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() {
        return Number(this.dataset.mockCurrentTime || '0');
      },
      set(value) {
        this.dataset.mockCurrentTime = String(value);
      },
    });
  });

  await page.locator('audio').evaluate((audio) => {
    audio.currentTime = 1.05;
    audio.dispatchEvent(new Event('pause'));
  });

  await expect(page.getByRole('button', { name: /Paused target drill/ })).toContainText('Resume from 00:01');
});

test('switching from a playing active project still saves the first pause on the newly selected project', async ({ page }) => {
  await createTimedReaderProject(page, 'Playing source drill');
  await createTimedReaderProject(page, 'Playing target drill');

  await page.getByRole('button', { name: /Playing source drill/ }).click();
  await page.locator('audio').evaluate((audio) => {
    audio.dataset.mockCurrentTime = '0';
    audio.dataset.mockPaused = 'false';
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() {
        return Number(this.dataset.mockCurrentTime || '0');
      },
      set(value) {
        this.dataset.mockCurrentTime = String(value);
      },
    });
    Object.defineProperty(audio, 'paused', {
      configurable: true,
      get() {
        return this.dataset.mockPaused !== 'false';
      },
    });
  });

  await page.locator('audio').evaluate((audio) => {
    audio.currentTime = 2.05;
  });

  await page.getByRole('button', { name: /Playing target drill/ }).click();
  await page.locator('audio').evaluate((audio) => {
    audio.dataset.mockCurrentTime = '0';
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() {
        return Number(this.dataset.mockCurrentTime || '0');
      },
      set(value) {
        this.dataset.mockCurrentTime = String(value);
      },
    });
  });

  await page.locator('audio').evaluate((audio) => {
    audio.currentTime = 1.05;
    audio.dispatchEvent(new Event('pause'));
  });

  await expect(page.getByRole('button', { name: /Playing target drill/ })).toContainText('Resume from 00:01');
});

test('restoring saved progress uses time even if the stored segment index is stale', async ({ page }) => {
  await createTimedReaderProject(page, 'Stale progress drill');

  const projectId = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = window.indexedDB.open('lingualearn-sync-reader', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const projects = await new Promise((resolve, reject) => {
      const transaction = database.transaction('projects', 'readonly');
      const request = transaction.objectStore('projects').getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    database.close();
    return projects[0].id;
  });

  await page.evaluate(({ key, projectId: id }) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        [id]: {
          time: 1.05,
          segmentIndex: 0,
          savedAt: '2026-03-17T00:00:00.000Z',
        },
      }),
    );
  }, { key: 'lingualearn-sync-reader-progress-v1', projectId });

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('audio').evaluate((audio) => {
    audio.dataset.mockCurrentTime = '0';
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() {
        return Number(this.dataset.mockCurrentTime || '0');
      },
      set(value) {
        this.dataset.mockCurrentTime = String(value);
      },
    });
    Object.defineProperty(audio, 'duration', {
      configurable: true,
      get() {
        return 10;
      },
    });
  });

  await expect(page.getByText(/Continue from 00:01/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue where I stopped' }).click();
  await expect(page.getByTestId('reader-line-1')).toHaveAttribute('data-active', 'true');
});

test('opens the ready chapter 4 example from a direct link and restores saved progress', async ({
  page,
}) => {
  await mockReadyChapter4Assets(page);
  await page.goto(`${readerUrl}?example=hpmor-chapter-4`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'HPMOR Chapter 4 · Ready reader' })).toBeVisible();
  await expect(page.getByText(/Opened the ready reader for HPMOR Chapter 4/i)).toBeVisible();

  await page.locator('audio').evaluate((audio) => {
    audio.dataset.mockCurrentTime = '0';
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() {
        return Number(this.dataset.mockCurrentTime || '0');
      },
      set(value) {
        this.dataset.mockCurrentTime = String(value);
      },
    });
    Object.defineProperty(audio, 'duration', {
      configurable: true,
      get() {
        return 10;
      },
    });
  });

  await page.locator('audio').evaluate((audio) => {
    audio.currentTime = 1.05;
    audio.dispatchEvent(new Event('timeupdate'));
    audio.dispatchEvent(new Event('pause'));
  });

  await expect(page.getByText(/Continue from 00:01/)).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'HPMOR Chapter 4 · Ready reader' })).toBeVisible();

  await page.locator('audio').evaluate((audio) => {
    audio.dataset.mockCurrentTime = '0';
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() {
        return Number(this.dataset.mockCurrentTime || '0');
      },
      set(value) {
        this.dataset.mockCurrentTime = String(value);
      },
    });
    Object.defineProperty(audio, 'duration', {
      configurable: true,
      get() {
        return 10;
      },
    });
    audio.dispatchEvent(new Event('loadedmetadata'));
  });

  await expect(page.getByText(/Resumed your saved progress at 00:01/)).toBeVisible();
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => Number(audio.dataset.mockCurrentTime || '0')))
    .toBeGreaterThan(1);
});
