import { test, expect } from '@playwright/test';

const readerUrl = 'http://127.0.0.1:5173/english/reader';
const hpmorResetStorageKey = 'lingualearn-sync-reader-hpmor-reset-version';
const tinyAudioDataUrl =
  'data:audio/wav;base64,UklGRqQMAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YYAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

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
