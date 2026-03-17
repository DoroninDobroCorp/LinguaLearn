export const HPMOR_AUDIO_PARTS = [
  {
    part: 1,
    startChapter: 1,
    endChapter: 21,
    durationSeconds: 11.2 * 3600,
    audioUrl: 'https://media.blubrry.com/hpmor/p/www.hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_1.mp3',
  },
  {
    part: 2,
    startChapter: 22,
    endChapter: 37,
    durationSeconds: 8.5 * 3600,
    audioUrl: 'https://media.blubrry.com/hpmor/p/www.hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_2.mp3',
  },
  {
    part: 3,
    startChapter: 38,
    endChapter: 63,
    durationSeconds: 13.2 * 3600,
    audioUrl: 'https://media.blubrry.com/hpmor/p/www.hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_3.mp3',
  },
  {
    part: 4,
    startChapter: 65,
    endChapter: 85,
    durationSeconds: 13.7 * 3600,
    audioUrl: 'https://media.blubrry.com/hpmor/p/www.hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_4.mp3',
  },
  {
    part: 5,
    startChapter: 86,
    endChapter: 99,
    durationSeconds: 7.9 * 3600,
    audioUrl: 'https://media.blubrry.com/hpmor/p/www.hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_5.mp3',
  },
  {
    part: 6,
    startChapter: 100,
    endChapter: 122,
    durationSeconds: 12.2 * 3600,
    audioUrl: 'https://media.blubrry.com/hpmor/p/www.hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_6.mp3',
  },
];

const ENTITY_MAP = {
  amp: '&',
  apos: "'",
  nbsp: ' ',
  quot: '"',
  lt: '<',
  gt: '>',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  mdash: '—',
  ndash: '–',
  hellip: '...',
  middot: '·',
};

function createHpmorError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (match, entity) => ENTITY_MAP[entity.toLowerCase()] ?? match);
}

function normalizeParagraphs(value) {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripHtmlToText(html) {
  return normalizeParagraphs(
    decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<\/?em>/gi, '')
        .replace(/<\/?strong>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\u00ad/g, ''),
    ),
  );
}

export function getHpmorAudioPart(chapterNumber) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > 122) {
    throw createHpmorError('HPMOR chapters run from 1 to 122.', 400);
  }

  if (chapterNumber === 64) {
    throw createHpmorError('Chapter 64 is not included in the available audiobook parts.', 400);
  }

  const part = HPMOR_AUDIO_PARTS.find(
    (candidate) => chapterNumber >= candidate.startChapter && chapterNumber <= candidate.endChapter,
  );

  if (!part) {
    throw createHpmorError('No HPMOR audiobook part was found for that chapter.', 404);
  }

  return part;
}

export function extractHpmorChapterTitle(html) {
  const chapterTitleMatch = html.match(/<div id=["']chapter-title["']>([\s\S]*?)<\/div>/i);
  if (chapterTitleMatch) {
    return stripHtmlToText(chapterTitleMatch[1]).replace(/\s+/g, ' ').trim();
  }

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return stripHtmlToText(titleMatch[1]).replace(/\s+/g, ' ').trim();
  }

  throw createHpmorError('Failed to parse the HPMOR chapter title.', 502);
}

export function extractHpmorChapterText(html) {
  const storyMatch =
    html.match(/<div class=['"]storycontent[^>]*id=['"]storycontent['"][^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div[^>]*id=['"]storycontent['"][^>]*>([\s\S]*?)<\/div>/i);

  if (!storyMatch) {
    throw createHpmorError('Failed to parse the HPMOR chapter text.', 502);
  }

  return stripHtmlToText(storyMatch[1]);
}

function estimateWindow(chapterLengths, targetChapterNumber, audioDuration) {
  const totalLength = chapterLengths.reduce((sum, chapter) => sum + chapter.length, 0);
  const targetChapter = chapterLengths.find((chapter) => chapter.chapterNumber === targetChapterNumber);

  if (!targetChapter || totalLength <= 0) {
    return {
      start: 0,
      end: audioDuration,
    };
  }

  const textBeforeTarget = chapterLengths
    .filter((chapter) => chapter.chapterNumber < targetChapterNumber)
    .reduce((sum, chapter) => sum + chapter.length, 0);

  const start = (textBeforeTarget / totalLength) * audioDuration;
  const end = ((textBeforeTarget + targetChapter.length) / totalLength) * audioDuration;

  return {
    start,
    end: Math.max(end, start + 1),
  };
}

export async function buildHpmorChapterImport({ chapterNumber, fetchChapterHtml }) {
  const part = getHpmorAudioPart(chapterNumber);

  const chapterNumbers = [];
  for (let current = part.startChapter; current <= part.endChapter; current += 1) {
    chapterNumbers.push(current);
  }

  const htmlEntries = await Promise.all(
    chapterNumbers.map(async (currentChapterNumber) => ({
      chapterNumber: currentChapterNumber,
      html: await fetchChapterHtml(currentChapterNumber),
    })),
  );

  const chapterLengths = htmlEntries.map(({ chapterNumber: currentChapterNumber, html }) => ({
    chapterNumber: currentChapterNumber,
    length: extractHpmorChapterText(html).length,
  }));

  const targetHtml = htmlEntries.find((entry) => entry.chapterNumber === chapterNumber)?.html;
  if (!targetHtml) {
    throw createHpmorError(`Failed to load HPMOR chapter ${chapterNumber}.`, 502);
  }

  const estimatedRange = estimateWindow(chapterLengths, chapterNumber, part.durationSeconds);

  return {
    chapterNumber,
    title: extractHpmorChapterTitle(targetHtml),
    text: extractHpmorChapterText(targetHtml),
    audioUrl: part.audioUrl,
    audioDurationEstimate: part.durationSeconds,
    audioLabel: `HPMOR audiobook part ${part.part}`,
    estimatedRange,
    source: 'hpmor',
  };
}
