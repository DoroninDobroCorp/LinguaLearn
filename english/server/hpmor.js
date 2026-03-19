export const HPMOR_AUDIO_PARTS = [
  {
    part: 1,
    startChapter: 1,
    endChapter: 21,
    durationSeconds: 11.2 * 3600,
    audioUrl: 'https://hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_1.mp3',
  },
  {
    part: 2,
    startChapter: 22,
    endChapter: 37,
    durationSeconds: 8.5 * 3600,
    audioUrl: 'https://hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_2.mp3',
  },
  {
    part: 3,
    startChapter: 38,
    endChapter: 63,
    durationSeconds: 13.2 * 3600,
    audioUrl: 'https://hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_3.mp3',
  },
  {
    part: 4,
    startChapter: 65,
    endChapter: 85,
    durationSeconds: 13.7 * 3600,
    audioUrl: 'https://hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_4.mp3',
  },
  {
    part: 5,
    startChapter: 86,
    endChapter: 99,
    durationSeconds: 7.9 * 3600,
    audioUrl: 'https://hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_5.mp3',
  },
  {
    part: 6,
    startChapter: 100,
    endChapter: 122,
    durationSeconds: 12.2 * 3600,
    audioUrl: 'https://hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Part_6.mp3',
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

const HPMOR_FRONT_MATTER_PREFIXES = [/^disclaimer:/i, /^a\/n:/i, /^an:/i, /^author'?s note:/i, /^edit:/i, /^note:/i];

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

function normalizeMediaUrl(url) {
  const decodedUrl = decodeHtmlEntities(url).trim();
  const pathMatch = decodedUrl.match(/\/wp-content\/uploads\/episodes\/[^"'?#\s]+\.mp3/i);
  if (pathMatch) {
    return `https://hpmorpodcast.com${pathMatch[0]}`;
  }

  return decodedUrl.replace(/^http:\/\//i, 'https://');
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

function buildCoverageLabel(chapterNumbers) {
  if (!chapterNumbers.length) {
    return 'chapter audio';
  }

  if (chapterNumbers.length === 1) {
    return `chapter ${chapterNumbers[0]}`;
  }

  const firstChapter = chapterNumbers[0];
  const lastChapter = chapterNumbers[chapterNumbers.length - 1];
  return `chapters ${firstChapter}-${lastChapter}`;
}

function parsePodcastFileInfo(audioUrl) {
  const filename = audioUrl.match(/\/([^/?#]+)\.mp3/i)?.[1] || '';

  if (!/^HPMoR_Chap_/i.test(filename)) {
    return {
      filename,
      isPartial: false,
    };
  }

  const tokenString = filename.replace(/^HPMoR_Chap_/i, '');
  const rawTokens = tokenString.split('-').filter(Boolean);

  return {
    filename,
    isPartial: rawTokens.some((token) => /[a-z]/i.test(token)),
  };
}

function buildPodcastEntry(sectionHtml) {
  const audioMatch = sectionHtml.match(/href=["'](https?:\/\/[^"']+\.mp3)["']/i);
  if (!audioMatch) {
    return null;
  }

  const postUrlMatch = sectionHtml.match(/<a[^>]*href=["']([^"']+)["'][^>]*>\s*Post\s*<\/a>/i);
  const audioUrl = normalizeMediaUrl(audioMatch[1]);
  const sectionText = stripHtmlToText(sectionHtml);
  const chapterNumbers = Array.from(
    new Set(
      Array.from(sectionText.matchAll(/Chapter\s+(\d+)/gi), (match) => Number.parseInt(match[1], 10)).filter(
        Number.isInteger,
      ),
    ),
  ).sort((left, right) => left - right);

  if (!chapterNumbers.length) {
    return null;
  }

  const fileInfo = parsePodcastFileInfo(audioUrl);
  const coverageLabel = buildCoverageLabel(chapterNumbers);

  return {
    audioUrl,
    audioLabel:
      chapterNumbers.length === 1
        ? `HPMOR podcast episode · ${coverageLabel}`
        : `HPMOR podcast episode group · ${coverageLabel}`,
    chapterNumbers,
    isPartial: fileInfo.isPartial,
    postUrl: postUrlMatch ? decodeHtmlEntities(postUrlMatch[1]).trim() : null,
  };
}

export function parseHpmorPodcastEpisodeEntries(html) {
  const episodeIndex = html.indexOf('Also available by episode');
  const relevantHtml = episodeIndex >= 0 ? html.slice(episodeIndex) : html;

  return relevantHtml
    .split(/<hr\s*\/?>/i)
    .map((sectionHtml) => buildPodcastEntry(sectionHtml))
    .filter(Boolean);
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

function looksLikeHpmorFrontMatter(paragraph) {
  const normalizedParagraph = paragraph.replace(/\s+/g, ' ').trim();
  if (!normalizedParagraph) {
    return false;
  }

  if (HPMOR_FRONT_MATTER_PREFIXES.some((pattern) => pattern.test(normalizedParagraph))) {
    return true;
  }

  return normalizedParagraph.length <= 240 && /J\.\s*K\.\s*Rowling/i.test(normalizedParagraph);
}

function stripLeadingHpmorFrontMatter(text) {
  const paragraphs = normalizeParagraphs(text)
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  let storyStartIndex = 0;
  while (storyStartIndex < paragraphs.length && looksLikeHpmorFrontMatter(paragraphs[storyStartIndex])) {
    storyStartIndex += 1;
  }

  return normalizeParagraphs(paragraphs.slice(storyStartIndex).join('\n\n'));
}

export function buildHpmorNarrationText(title, text) {
  const normalizedTitle = normalizeParagraphs(String(title || '').replace(/\s+/g, ' '));
  const storyText = stripLeadingHpmorFrontMatter(text);
  const storyAlreadyStartsWithTitle =
    normalizedTitle && storyText.toLowerCase().startsWith(normalizedTitle.toLowerCase());

  return normalizeParagraphs(
    [normalizedTitle, storyAlreadyStartsWithTitle ? '' : storyText]
      .filter(Boolean)
      .join('\n\n'),
  );
}

function parseIso8601Duration(value) {
  const match = String(value || '').trim().match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)$/i);
  if (!match) {
    return null;
  }

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : null;
}

export function extractPodcastAudioDuration(html) {
  const durationMatch =
    html.match(/<meta[^>]*itemprop=["']duration["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*itemprop=["']duration["'][^>]*>/i);

  return parseIso8601Duration(durationMatch?.[1]);
}

async function maybeApplyExactPodcastDuration(audioSource, fetchPodcastPostHtml) {
  if (!audioSource.postUrl || !fetchPodcastPostHtml) {
    return audioSource;
  }

  try {
    const podcastPostHtml = await fetchPodcastPostHtml(audioSource.postUrl);
    const exactDuration = extractPodcastAudioDuration(podcastPostHtml);
    if (!Number.isFinite(exactDuration) || exactDuration <= 0) {
      return audioSource;
    }

    const startRatio = Number(audioSource.estimatedWindow?.startRatio) || 0;
    const endRatio = Number(audioSource.estimatedWindow?.endRatio) || 1;

    return {
      ...audioSource,
      audioDurationEstimate: exactDuration,
      estimatedRange: {
        start: startRatio * exactDuration,
        end: Math.max(endRatio * exactDuration, startRatio * exactDuration + 1),
      },
    };
  } catch {
    return audioSource;
  }
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

function buildEstimatedWindow(estimatedRange, audioDurationEstimate) {
  if (!Number.isFinite(audioDurationEstimate) || audioDurationEstimate <= 0) {
    return {
      startRatio: 0,
      endRatio: 1,
    };
  }

  const startRatio = Math.max(0, Math.min(1, estimatedRange.start / audioDurationEstimate));
  const endRatio = Math.max(startRatio, Math.min(1, estimatedRange.end / audioDurationEstimate));

  return {
    startRatio,
    endRatio,
  };
}

function estimateCoverageDuration(chapterLengths, coverageChapterNumbers, totalDuration) {
  const totalLength = chapterLengths.reduce((sum, chapter) => sum + chapter.length, 0);
  const coverageLength = chapterLengths
    .filter((chapter) => coverageChapterNumbers.includes(chapter.chapterNumber))
    .reduce((sum, chapter) => sum + chapter.length, 0);

  if (totalLength <= 0 || coverageLength <= 0) {
    return totalDuration;
  }

  return Math.max((coverageLength / totalLength) * totalDuration, 1);
}

function selectHpmorAudioSource({ chapterNumber, chapterLengths, part, podcastHtml }) {
  const podcastEntries = podcastHtml ? parseHpmorPodcastEpisodeEntries(podcastHtml) : [];
  const podcastCandidates = podcastEntries
    .filter(
      (entry) =>
        !entry.isPartial &&
        entry.chapterNumbers.includes(chapterNumber) &&
        entry.chapterNumbers.every(
          (coveredChapter) => coveredChapter >= part.startChapter && coveredChapter <= part.endChapter,
        ),
    )
    .sort(
      (left, right) =>
        left.chapterNumbers.length - right.chapterNumbers.length ||
        left.chapterNumbers[0] - right.chapterNumbers[0],
    );

  if (!podcastCandidates.length) {
    const partChapterNumbers = chapterLengths.map((chapter) => chapter.chapterNumber);
    const estimatedRange = estimateWindow(chapterLengths, chapterNumber, part.durationSeconds);

    return {
      audioUrl: part.audioUrl,
      audioDurationEstimate: part.durationSeconds,
      audioLabel: `HPMOR audiobook part ${part.part}`,
      estimatedRange,
      estimatedWindow: buildEstimatedWindow(estimatedRange, part.durationSeconds),
      audioSourceType: 'audiobook-part-fallback',
      syncHint:
        'This chapter is split across podcast sub-episodes or lacks a chapter-level file, so LinguaLearn is using the wider audiobook part as a fallback.',
      coverageChapterNumbers: partChapterNumbers,
    };
  }

  const bestCandidate = podcastCandidates[0];
  const audioDurationEstimate = estimateCoverageDuration(
    chapterLengths,
    bestCandidate.chapterNumbers,
    part.durationSeconds,
  );
  const coverageChapterLengths = chapterLengths.filter((chapter) =>
    bestCandidate.chapterNumbers.includes(chapter.chapterNumber),
  );
  const estimatedRange = estimateWindow(coverageChapterLengths, chapterNumber, audioDurationEstimate);

  return {
    audioUrl: bestCandidate.audioUrl,
    audioDurationEstimate,
    audioLabel: bestCandidate.audioLabel,
    estimatedRange,
    estimatedWindow: buildEstimatedWindow(estimatedRange, audioDurationEstimate),
    audioSourceType: bestCandidate.chapterNumbers.length === 1 ? 'episode' : 'episode-group',
    syncHint:
      bestCandidate.chapterNumbers.length === 1
        ? 'LinguaLearn found a chapter-specific HPMOR podcast file, so the import should land much closer to the right text.'
        : 'LinguaLearn found a narrow HPMOR podcast episode group, so the import should stay much tighter than the full audiobook part.',
    coverageChapterNumbers: bestCandidate.chapterNumbers,
    postUrl: bestCandidate.postUrl || null,
  };
}

export async function buildHpmorChapterImport({
  chapterNumber,
  fetchChapterHtml,
  fetchPodcastHtml,
  fetchPodcastPostHtml,
}) {
  const part = getHpmorAudioPart(chapterNumber);

  const chapterNumbers = [];
  for (let current = part.startChapter; current <= part.endChapter; current += 1) {
    chapterNumbers.push(current);
  }

  const [htmlEntries, podcastHtml] = await Promise.all([
    Promise.all(
      chapterNumbers.map(async (currentChapterNumber) => ({
        chapterNumber: currentChapterNumber,
        html: await fetchChapterHtml(currentChapterNumber),
      })),
    ),
    fetchPodcastHtml ? fetchPodcastHtml().catch(() => '') : Promise.resolve(''),
  ]);

  const chapterEntries = htmlEntries.map(({ chapterNumber: currentChapterNumber, html }) => {
    const title = extractHpmorChapterTitle(html);
    const text = extractHpmorChapterText(html);

    return {
      chapterNumber: currentChapterNumber,
      title,
      narrationText: buildHpmorNarrationText(title, text),
    };
  });

  const chapterLengths = chapterEntries.map(({ chapterNumber: currentChapterNumber, narrationText }) => ({
    chapterNumber: currentChapterNumber,
    length: narrationText.length,
  }));

  const targetChapter = chapterEntries.find((entry) => entry.chapterNumber === chapterNumber);
  if (!targetChapter) {
    throw createHpmorError(`Failed to load HPMOR chapter ${chapterNumber}.`, 502);
  }

  const audioSource = await maybeApplyExactPodcastDuration(
    selectHpmorAudioSource({
      chapterNumber,
      chapterLengths,
      part,
      podcastHtml,
    }),
    fetchPodcastPostHtml,
  );
  const { postUrl: _postUrl, ...publicAudioSource } = audioSource;

  return {
    chapterNumber,
    title: targetChapter.title,
    text: targetChapter.narrationText,
    source: 'hpmor',
    ...publicAudioSource,
  };
}
