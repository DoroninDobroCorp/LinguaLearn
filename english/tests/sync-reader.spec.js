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
