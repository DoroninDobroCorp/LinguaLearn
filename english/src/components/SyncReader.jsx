import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Bookmark,
  Clock3,
  Columns2,
  Download,
  Eye,
  EyeOff,
  FileAudio,
  FileText,
  Headphones,
  Link2,
  Minimize2,
  Pin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import {
  estimateSegmentBoundaries,
  exportSegmentsToJson,
  findSegmentIndexByTime,
  formatTime,
  generateProjectId,
  parseTimedTranscript,
  splitTextIntoSegments,
} from '../utils/syncReader';
import {
  deleteReaderProject,
  deleteReaderProjects,
  getAllReaderProjects,
  saveReaderProject,
} from '../utils/syncReaderStorage';

const HPMOR_TEXT_URL = 'https://hpmor.com/';
const HPMOR_AUDIO_URL = 'https://hpmorpodcast.com/?page_id=56';
const HPMOR_RESET_STORAGE_KEY = 'lingualearn-sync-reader-hpmor-reset-version';
const HPMOR_RESET_VERSION = '2026-03-18-local-whisper-reset';
const READER_PROGRESS_STORAGE_KEY = 'lingualearn-sync-reader-progress-v1';
const READER_TRANSLATION_STORAGE_KEY = 'lingualearn-sync-reader-translations-v1';
const READY_READER_EXAMPLES = {
  'hpmor-chapter-4': {
    key: 'hpmor-chapter-4',
    projectId: 'reader-example-hpmor-chapter-4',
    version: '2026-03-17-distil-v1',
    title: 'HPMOR Chapter 4 · Ready reader',
    audioUrl: 'https://hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Chap_4-5.mp3',
    audioName: 'HPMOR podcast episode group · chapters 4-5',
    timingsUrl: '/english/reader-examples/chapter4-distil-large-v3-words.json',
    timingsName: 'Prepared chapter 4 transcript · word-level timings',
    textName: 'Prepared HPMOR chapter 4 transcript',
    source: 'reader-example',
    sourceExampleKey: 'hpmor-chapter-4',
  },
  'hpmor-chapter-12': {
    key: 'hpmor-chapter-12',
    projectId: 'reader-example-hpmor-chapter-12',
    version: '2026-03-19-local-whisper-ru-v2',
    title: 'HPMOR Chapter 12 · Ready reader',
    audioUrl: 'https://hpmorpodcast.com/wp-content/uploads/episodes/HPMoR_Chap_12.mp3',
    audioName: 'HPMOR podcast episode · chapter 12',
    timingsUrl: '/english/reader-examples/chapter12-local-whisper-lines.json',
    translationsUrl: '/english/reader-examples/chapter12-local-whisper-lines.ru.json',
    timingsName: 'Prepared chapter 12 transcript · local Whisper line timings',
    textName: 'Prepared HPMOR chapter 12 transcript',
    source: 'reader-example',
    sourceExampleKey: 'hpmor-chapter-12',
  },
};

function createEmptyForm() {
  return {
    title: '',
    text: '',
    segmentationMode: 'paragraph',
    audioUrl: '',
    textFile: null,
    audioFile: null,
    timingsFile: null,
  };
}

function buildReaderApiCandidates(path) {
  const normalizedPath = String(path || '').startsWith('/api/')
    ? String(path)
    : `/api/${String(path || '').replace(/^\/+/, '')}`;

  const candidates = [`/english${normalizedPath}`, normalizedPath];

  if (typeof window !== 'undefined') {
    const directHosts = [window.location.hostname];
    if (window.location.hostname === 'localhost') {
      directHosts.push('127.0.0.1');
    } else if (window.location.hostname === '127.0.0.1') {
      directHosts.push('localhost');
    }

    directHosts
      .filter(Boolean)
      .forEach((host) => {
        candidates.push(`${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${host}:3001${normalizedPath}`);
      });
  }

  return [...new Set(candidates)];
}

function tryParseJsonResponse(rawText) {
  try {
    return rawText ? JSON.parse(rawText) : null;
  } catch {
    return null;
  }
}

function isHtmlResponse(rawText, contentType = '') {
  const normalizedText = String(rawText || '').trim().toLowerCase();
  const normalizedContentType = String(contentType || '').toLowerCase();
  return (
    normalizedContentType.includes('text/html') ||
    normalizedText.startsWith('<!doctype html') ||
    normalizedText.startsWith('<html')
  );
}

function normalizeBusyProgress(progress) {
  if (!progress || typeof progress !== 'object') {
    return null;
  }

  const label = String(progress.label || '').trim();
  if (!label) {
    return null;
  }

  const rawPercent = progress.percent;
  const percent =
    rawPercent === null || typeof rawPercent === 'undefined' || rawPercent === ''
      ? Number.NaN
      : Number(rawPercent);
  return {
    label,
    detail: String(progress.detail || '').trim(),
    percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null,
  };
}

function readReaderProgressMap() {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const storedValue = window.localStorage.getItem(READER_PROGRESS_STORAGE_KEY);
    const parsedValue = storedValue ? JSON.parse(storedValue) : {};
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
  } catch {
    return {};
  }
}

function normalizeReaderProgress(progress) {
  if (!progress || typeof progress !== 'object') {
    return null;
  }

  const time = Number(progress.time);
  if (!Number.isFinite(time) || time < 0) {
    return null;
  }

  const segmentIndex = Number(progress.segmentIndex);
  return {
    time: Number(time.toFixed(3)),
    segmentIndex: Number.isInteger(segmentIndex) && segmentIndex >= 0 ? segmentIndex : 0,
    savedAt: typeof progress.savedAt === 'string' ? progress.savedAt : null,
  };
}

function getStoredReaderProgress(projectId) {
  if (!projectId) {
    return null;
  }

  return normalizeReaderProgress(readReaderProgressMap()[projectId]);
}

function setStoredReaderProgress(projectId, progress) {
  if (typeof window === 'undefined' || !projectId) {
    return;
  }

  const normalizedProgress = normalizeReaderProgress(progress);
  if (!normalizedProgress) {
    return;
  }

  const currentMap = readReaderProgressMap();
  currentMap[projectId] = normalizedProgress;
  window.localStorage.setItem(READER_PROGRESS_STORAGE_KEY, JSON.stringify(currentMap));
}

function clearStoredReaderProgress(projectId) {
  if (typeof window === 'undefined' || !projectId) {
    return;
  }

  const currentMap = readReaderProgressMap();
  delete currentMap[projectId];

  if (Object.keys(currentMap).length) {
    window.localStorage.setItem(READER_PROGRESS_STORAGE_KEY, JSON.stringify(currentMap));
    return;
  }

  window.localStorage.removeItem(READER_PROGRESS_STORAGE_KEY);
}

function readReaderTranslationMap() {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const storedValue = window.localStorage.getItem(READER_TRANSLATION_STORAGE_KEY);
    const parsedValue = storedValue ? JSON.parse(storedValue) : {};
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
  } catch {
    return {};
  }
}

function normalizeProjectTranslations(translations) {
  if (!Array.isArray(translations)) {
    return null;
  }

  const normalizedTranslations = translations.map((translation) => String(translation || '').trim());
  return normalizedTranslations.length ? normalizedTranslations : null;
}

function getStoredReaderTranslations(projectId) {
  if (!projectId) {
    return null;
  }

  return normalizeProjectTranslations(readReaderTranslationMap()[projectId]);
}

async function loadPreparedReaderTranslations(example, exampleDisplayName) {
  if (!example?.translationsUrl) {
    return null;
  }

  const response = await fetch(example.translationsUrl);
  if (!response.ok) {
    throw new Error(`Failed to load the prepared Russian translation for ${exampleDisplayName}.`);
  }

  const rawTranslations = await response.text();
  const parsedTranslations = tryParseJsonResponse(rawTranslations);
  const normalizedTranslations = normalizeProjectTranslations(
    Array.isArray(parsedTranslations) ? parsedTranslations : parsedTranslations?.translations,
  );

  if (!normalizedTranslations?.length) {
    throw new Error(`The prepared Russian translation for ${exampleDisplayName} was empty.`);
  }

  return normalizedTranslations;
}

function setStoredReaderTranslations(projectId, translations) {
  if (typeof window === 'undefined' || !projectId) {
    return;
  }

  const normalizedTranslations = normalizeProjectTranslations(translations);
  if (!normalizedTranslations) {
    return;
  }

  const currentMap = readReaderTranslationMap();
  currentMap[projectId] = normalizedTranslations;
  window.localStorage.setItem(READER_TRANSLATION_STORAGE_KEY, JSON.stringify(currentMap));
}

function clearStoredReaderTranslations(projectId) {
  if (typeof window === 'undefined' || !projectId) {
    return;
  }

  const currentMap = readReaderTranslationMap();
  delete currentMap[projectId];

  if (Object.keys(currentMap).length) {
    window.localStorage.setItem(READER_TRANSLATION_STORAGE_KEY, JSON.stringify(currentMap));
    return;
  }

  window.localStorage.removeItem(READER_TRANSLATION_STORAGE_KEY);
}

function buildReaderExampleHref(exampleKey) {
  return `/english/reader?example=${encodeURIComponent(exampleKey)}`;
}

function getReadyReaderDisplayName(example) {
  return String(example?.title || 'ready reader').replace(/\s*·\s*Ready reader$/i, '');
}

function guessProjectTitleFromAudio(form) {
  const explicitTitle = form.title.trim();
  if (explicitTitle) {
    return explicitTitle;
  }

  const uploadedAudioName = String(form.audioFile?.name || '').trim();
  if (uploadedAudioName) {
    return uploadedAudioName.replace(/\.[a-z0-9]{1,8}$/i, '') || 'Untitled reader project';
  }

  const audioUrl = String(form.audioUrl || '').trim();
  if (audioUrl) {
    try {
      const pathname = new URL(audioUrl).pathname;
      const lastPathSegment = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
      return lastPathSegment.replace(/\.[a-z0-9]{1,8}$/i, '') || 'Untitled reader project';
    } catch {
      return 'Untitled reader project';
    }
  }

  return 'Untitled reader project';
}

function removeReaderBootstrapParams() {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('resetReader');
  url.searchParams.delete('seedChapter');
  url.searchParams.delete('seedMode');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file);
  });
}

function sortProjects(projects) {
  return [...projects].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function countVisibleAnchors(project) {
  return Object.keys(project.manualAnchors || {}).filter((index) => {
    const numericIndex = Number(index);
    return Number.isInteger(numericIndex) && numericIndex > 0 && numericIndex < project.segments.length;
  }).length;
}

function clampRatio(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function scrollReaderLineIntoView(container, element) {
  if (!container || !element) {
    return;
  }

  const margin = 24;
  const elementTop = element.offsetTop;
  const elementBottom = elementTop + element.offsetHeight;
  const visibleTop = container.scrollTop;
  const visibleBottom = visibleTop + container.clientHeight;

  if (elementTop < visibleTop + margin) {
    container.scrollTo({
      top: Math.max(elementTop - margin, 0),
      behavior: 'smooth',
    });
    return;
  }

  if (elementBottom > visibleBottom - margin) {
    container.scrollTo({
      top: Math.max(elementBottom - container.clientHeight + margin, 0),
      behavior: 'smooth',
    });
  }
}

function clampScrollTop(container, value) {
  if (!container) {
    return 0;
  }

  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
  return Math.max(0, Math.min(maxScrollTop, Number.isFinite(value) ? value : 0));
}

function buildSegmentRefEntries(segmentRefs) {
  return Object.entries(segmentRefs || {})
    .map(([index, element]) => ({
      index: Number(index),
      element,
    }))
    .filter(({ index, element }) => Number.isInteger(index) && element)
    .sort((left, right) => left.index - right.index);
}

function findScrollAnchor(segmentRefs, scrollTop) {
  const entries = buildSegmentRefEntries(segmentRefs);
  if (!entries.length) {
    return null;
  }

  let previousEntry = null;

  for (const entry of entries) {
    const top = entry.element.offsetTop;
    const height = entry.element.offsetHeight;
    const bottom = top + height;

    if (scrollTop < top) {
      if (!previousEntry) {
        return {
          index: entry.index,
          progress: 0,
        };
      }

      return {
        index: previousEntry.index,
        progress: 1,
      };
    }

    if (scrollTop <= bottom) {
      return {
        index: entry.index,
        progress: height > 0 ? clampRatio((scrollTop - top) / height, 0) : 0,
      };
    }

    previousEntry = entry;
  }

  return {
    index: previousEntry ? previousEntry.index : entries[entries.length - 1].index,
    progress: 1,
  };
}

function syncSplitScrollPosition({
  sourceContainer,
  sourceSegmentRefs,
  targetContainer,
  targetSegmentRefs,
}) {
  if (!sourceContainer || !targetContainer) {
    return;
  }

  const sourceMaxScrollTop = Math.max(sourceContainer.scrollHeight - sourceContainer.clientHeight, 0);
  const targetMaxScrollTop = Math.max(targetContainer.scrollHeight - targetContainer.clientHeight, 0);
  if (targetMaxScrollTop <= 0) {
    targetContainer.scrollTop = 0;
    return;
  }

  const sourceScrollTop = clampScrollTop(sourceContainer, sourceContainer.scrollTop);
  const anchor = findScrollAnchor(sourceSegmentRefs, sourceScrollTop);
  const targetAnchorElement =
    anchor && targetSegmentRefs ? targetSegmentRefs[anchor.index] || null : null;

  if (anchor && targetAnchorElement) {
    const targetScrollTop =
      targetAnchorElement.offsetTop + anchor.progress * targetAnchorElement.offsetHeight;
    targetContainer.scrollTop = clampScrollTop(targetContainer, targetScrollTop);
    return;
  }

  if (sourceMaxScrollTop <= 0) {
    targetContainer.scrollTop = 0;
    return;
  }

  targetContainer.scrollTop = clampScrollTop(
    targetContainer,
    (sourceScrollTop / sourceMaxScrollTop) * targetMaxScrollTop,
  );
}

function extractHpmorChapterNumber(project) {
  if (!project || project.source !== 'hpmor') {
    return null;
  }

  if (Number.isInteger(project.sourceChapterNumber)) {
    return project.sourceChapterNumber;
  }

  const textNameMatch = String(project.textName || '').match(/^HPMOR chapter (\d+)$/i);
  if (textNameMatch) {
    return Number.parseInt(textNameMatch[1], 10);
  }

  const titleMatch = String(project.title || '').match(/^Chapter\s+(\d+)\b/i);
  if (titleMatch) {
    return Number.parseInt(titleMatch[1], 10);
  }

  return null;
}

function findMatchingHpmorProjects(projects, chapterNumber) {
  return projects.filter((project) => extractHpmorChapterNumber(project) === chapterNumber);
}

function getHpmorProjects(projects) {
  return projects.filter((project) => project.source === 'hpmor');
}

function findMatchingExampleProjects(projects, exampleKey) {
  return projects.filter(
    (project) => project.source === 'reader-example' && project.sourceExampleKey === exampleKey,
  );
}

function needsLegacyHpmorReset() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(HPMOR_RESET_STORAGE_KEY) !== HPMOR_RESET_VERSION;
}

function markLegacyHpmorResetApplied() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(HPMOR_RESET_STORAGE_KEY, HPMOR_RESET_VERSION);
}

function getEstimatedWindowAnchors(project, duration, segmentCount) {
  if (!Number.isFinite(duration) || duration <= 0 || !project.estimatedWindow) {
    return {};
  }

  const startRatio = clampRatio(project.estimatedWindow.startRatio, 0);
  const endRatio = clampRatio(project.estimatedWindow.endRatio, 1);
  const start = Number((duration * startRatio).toFixed(3));
  const end = Number((duration * Math.max(endRatio, startRatio)).toFixed(3));
  const safeEnd = Math.max(start, Math.min(duration, end));

  return {
    0: start,
    [segmentCount]: safeEnd,
  };
}

function buildCombinedAnchors(project, duration, segmentCount) {
  return {
    ...getEstimatedWindowAnchors(project, duration, segmentCount),
    ...(project.manualAnchors || {}),
  };
}

function getSegmentBadges(project) {
  return {
    modeLabel:
      project.source === 'reader-example'
        ? 'Ready transcript'
        : project.timingMode === 'timed'
          ? 'Timed transcript'
          : 'Rough sync + anchors',
    segmentCount: project.segments.length,
    manualAnchors: countVisibleAnchors(project),
  };
}

function buildEstimatedSegments(project, duration) {
  const rawSegments = splitTextIntoSegments(project.rawText, project.segmentationMode);
  return estimateSegmentBoundaries(
    rawSegments,
    duration,
    buildCombinedAnchors(project, duration, rawSegments.length),
  );
}

function normalizeLoadedProject(project) {
  const projectWithDefaults = {
    ...project,
    bookmark: project?.bookmark || null,
    readingProgress: getStoredReaderProgress(project?.id) || project?.readingProgress || null,
    needsInitialSeek: Boolean(project?.needsInitialSeek),
  };

  if (
    projectWithDefaults?.source !== 'hpmor' ||
    projectWithDefaults?.timingMode !== 'estimated' ||
    projectWithDefaults?.estimatedWindow
  ) {
    return projectWithDefaults;
  }

  const segmentCount = Array.isArray(projectWithDefaults.segments) ? projectWithDefaults.segments.length : 0;
  if (segmentCount <= 0) {
    return projectWithDefaults;
  }

  const startAnchor = Number(projectWithDefaults.manualAnchors?.[0]);
  const endAnchor = Number(projectWithDefaults.manualAnchors?.[segmentCount]);
  const duration = Number(projectWithDefaults.audioDuration) || endAnchor;

  if (!Number.isFinite(startAnchor) || !Number.isFinite(endAnchor) || !Number.isFinite(duration) || duration <= 0) {
    return projectWithDefaults;
  }

  const manualAnchors = { ...(projectWithDefaults.manualAnchors || {}) };
  delete manualAnchors[0];
  delete manualAnchors[segmentCount];

  const normalizedProject = {
    ...projectWithDefaults,
    manualAnchors,
    estimatedWindow: {
      startRatio: clampRatio(startAnchor / duration, 0),
      endRatio: clampRatio(endAnchor / duration, 1),
    },
  };

  return {
    ...normalizedProject,
    segments: buildEstimatedSegments(normalizedProject, duration),
  };
}

function downloadJson(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildProjectSummary(project) {
  const firstSegment = project.segments[0];
  const lastSegment = project.segments[project.segments.length - 1];
  const hasTiming = Number.isFinite(firstSegment?.start) && Number.isFinite(lastSegment?.end);

  return {
    hasTiming,
    firstTime: hasTiming ? formatTime(firstSegment.start) : 'rough',
    lastTime: hasTiming ? formatTime(lastSegment.end) : 'pending',
  };
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) ||
    target.closest('input, textarea, select, button, [contenteditable="true"]')
  );
}

function findActiveWordIndex(words, time) {
  if (!Array.isArray(words) || !words.length || !Number.isFinite(time)) {
    return -1;
  }

  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex];
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) {
      continue;
    }

    if (time >= word.start && time < word.end) {
      return wordIndex;
    }
  }

  if (time >= words[words.length - 1].end) {
    return words.length - 1;
  }

  return -1;
}

function getBookmarkSnippet(bookmark) {
  if (!bookmark?.text) {
    return 'No bookmark text yet.';
  }

  return bookmark.text.length > 120 ? `${bookmark.text.slice(0, 117)}...` : bookmark.text;
}

function SyncReader() {
  const { isDark } = useTheme();
  const initialExampleKey = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return new URLSearchParams(window.location.search).get('example');
  }, []);
  const initialReaderBootstrap = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        resetReader: false,
        seedChapter: null,
        seedMode: 'timed',
      };
    }

    const params = new URLSearchParams(window.location.search);
    const rawSeedChapter = Number.parseInt(params.get('seedChapter') || '', 10);

    return {
      resetReader: params.get('resetReader') === 'all',
      seedChapter: Number.isInteger(rawSeedChapter) ? rawSeedChapter : null,
      seedMode: params.get('seedMode') === 'rough' ? 'rough' : 'timed',
    };
  }, []);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioSource, setAudioSource] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [busyProgress, setBusyProgress] = useState(null);
  const [hasLoadedProjects, setHasLoadedProjects] = useState(false);
  const [hpmorChapter, setHpmorChapter] = useState('1');
  const [followPlayback, setFollowPlayback] = useState(false);
  const [isBilingualMode, setIsBilingualMode] = useState(false);
  const [isTranslationVisible, setIsTranslationVisible] = useState(true);
  const [isTranslationFirst, setIsTranslationFirst] = useState(false);
  const [projectTranslations, setProjectTranslations] = useState(() => readReaderTranslationMap());
  const [isTranslationBusy, setIsTranslationBusy] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const segmentRefs = useRef({});
  const segmentsContainerRef = useRef(null);
  const splitEnglishSegmentRefs = useRef({});
  const splitEnglishContainerRef = useRef(null);
  const splitTranslationSegmentRefs = useRef({});
  const splitTranslationContainerRef = useRef(null);
  const splitScrollSyncFrameRef = useRef(null);
  const isSyncingSplitScrollRef = useRef(false);
  const audioRef = useRef(null);
  const initialExampleHandledRef = useRef(false);
  const initialReaderBootstrapHandledRef = useRef(false);
  const restoredProgressKeyRef = useRef(null);
  const lastSavedProgressRef = useRef({
    projectId: null,
    time: -Infinity,
    segmentIndex: -1,
  });

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId],
  );
  const activeProjectTranslations = activeProject
    ? getStoredReaderTranslations(activeProject.id) || projectTranslations[activeProject.id] || null
    : null;
  const activeProjectHasTranslations =
    Array.isArray(activeProjectTranslations) &&
    activeProjectTranslations.length === (activeProject?.segments?.length || 0);

  const cardClass = isDark ? 'bg-slate-800 text-gray-100' : 'bg-white text-gray-800';
  const softCardClass = isDark ? 'bg-slate-700/70 border-slate-600' : 'bg-yellow-50 border-yellow-200';
  const inputClass = isDark
    ? 'bg-slate-700 border-slate-600 text-gray-100 placeholder:text-gray-400'
    : 'bg-white border-yellow-200 text-gray-800';
  const subtextClass = isDark ? 'text-gray-400' : 'text-gray-600';
  const accentTextClass = isDark ? 'text-yellow-300' : 'text-yellow-700';
  const borderClass = isDark ? 'border-slate-600' : 'border-yellow-200';

  useEffect(() => {
    let isMounted = true;

    async function loadProjects() {
      try {
        const savedProjects = await getAllReaderProjects();
        if (!isMounted) {
          return;
        }

        let normalizedProjects = savedProjects.map((project) => normalizeLoadedProject(project));

        if (needsLegacyHpmorReset()) {
          const staleHpmorProjects = getHpmorProjects(normalizedProjects);
          if (staleHpmorProjects.length > 0) {
            await deleteReaderProjects(staleHpmorProjects.map((project) => project.id));
            if (!isMounted) {
              return;
            }

            staleHpmorProjects.forEach((project) => {
              clearStoredReaderProgress(project.id);
              updateProjectTranslations(project.id, null);
            });
            normalizedProjects = normalizedProjects.filter((project) => project.source !== 'hpmor');
            setStatus({
              type: 'success',
              message: 'Removed old HPMOR chapter imports. You can start from scratch now.',
            });
          }

          markLegacyHpmorResetApplied();
        }

        setProjects(normalizedProjects);
        setActiveProjectId(normalizedProjects[0]?.id || null);
        setHasLoadedProjects(true);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setStatus({ type: 'error', message: error.message });
        setHasLoadedProjects(true);
      }
    }

    loadProjects();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedProjects || initialExampleHandledRef.current || !initialExampleKey) {
      return;
    }

    initialExampleHandledRef.current = true;

    if (!READY_READER_EXAMPLES[initialExampleKey]) {
      setStatus({
        type: 'error',
        message: `Unknown ready reader example: "${initialExampleKey}".`,
      });
      return;
    }

    handleOpenReadyReaderExample(initialExampleKey, { fromUrl: true }).catch((error) => {
      setStatus({ type: 'error', message: error.message });
    });
  }, [hasLoadedProjects, initialExampleKey, projects]);

  useEffect(() => {
    if (!hasLoadedProjects || initialReaderBootstrapHandledRef.current) {
      return;
    }

    const { resetReader, seedChapter, seedMode } = initialReaderBootstrap;
    if (!resetReader && !Number.isInteger(seedChapter)) {
      return;
    }

    initialReaderBootstrapHandledRef.current = true;

    async function bootstrapReader() {
      const currentProjects = await getAllReaderProjects();
      const projectIds = currentProjects.map((project) => project.id);

      if (projectIds.length > 0) {
        await deleteReaderProjects(projectIds);
      }

      projectIds.forEach((projectId) => {
        clearStoredReaderProgress(projectId);
        updateProjectTranslations(projectId, null);
      });

      setProjects([]);
      setActiveProjectId(null);
      setSelectedSegmentIndex(0);
      setActiveSegmentIndex(-1);
      setCurrentTime(0);
      markLegacyHpmorResetApplied();

      if (Number.isInteger(seedChapter)) {
        setHpmorChapter(String(seedChapter));
        const importedProject = await handleImportHpmor(seedMode, {
          chapterNumber: seedChapter,
          currentProjects: [],
        });
        if (importedProject && seedMode === 'timed') {
          await handleLoadProjectTranslations(importedProject);
        }
        setStatus({
          type: 'success',
          message: `Cleared reader cache and imported only HPMOR chapter ${seedChapter}${seedMode === 'timed' ? ' with timed transcript and Russian side translation.' : ' in rough sync mode.'}`,
        });
      } else {
        setStatus({
          type: 'success',
          message: 'Cleared the reader cache.',
        });
      }

      removeReaderBootstrapParams();
    }

    bootstrapReader().catch((error) => {
      setStatus({ type: 'error', message: error.message });
      removeReaderBootstrapParams();
    });
  }, [hasLoadedProjects, initialReaderBootstrap, projects]);

  useEffect(() => {
    if (!activeProject) {
      setSelectedSegmentIndex(0);
      setActiveSegmentIndex(-1);
      setCurrentTime(0);
      setIsBilingualMode(false);
      setIsTranslationVisible(true);
      setIsTranslationFirst(false);
      setTranslationError('');
      return;
    }

    setSelectedSegmentIndex((currentIndex) => {
      if (currentIndex < activeProject.segments.length) {
        return currentIndex;
      }

      return 0;
    });
  }, [activeProject]);

  useEffect(() => {
    restoredProgressKeyRef.current = null;
    setIsTranslationVisible(true);
    setIsTranslationFirst(false);
    setTranslationError('');
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProject) {
      setAudioSource('');
      return undefined;
    }

    if (activeProject.audioBlob) {
      const objectUrl = URL.createObjectURL(activeProject.audioBlob);
      setAudioSource(objectUrl);

      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }

    setAudioSource(activeProject.audioUrl || '');
    return undefined;
  }, [activeProject]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeProjectId]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.code !== 'Space' || event.repeat || isEditableTarget(event.target)) {
        return;
      }

      if (!audioRef.current || !audioSource || activeProject?.needsInitialSeek) {
        return;
      }

      event.preventDefault();

      if (audioRef.current.paused) {
        audioRef.current.play().catch((error) => {
          setStatus({ type: 'error', message: error.message });
        });
        return;
      }

      audioRef.current.pause();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeProject?.needsInitialSeek, audioSource]);

  useEffect(() => {
    if (!followPlayback || activeSegmentIndex < 0) {
      return;
    }

    const scrollTargets = [];

    if (!isBilingualMode) {
      scrollTargets.push({
        container: segmentsContainerRef.current,
        element: segmentRefs.current[activeSegmentIndex],
      });
    } else {
      scrollTargets.push(
        {
          container: splitEnglishContainerRef.current,
          element: splitEnglishSegmentRefs.current[activeSegmentIndex],
        },
        {
          container: splitTranslationContainerRef.current,
          element: splitTranslationSegmentRefs.current[activeSegmentIndex],
        },
      );
    }

    scrollTargets.forEach(({ container, element }) => {
      scrollReaderLineIntoView(container, element);
    });
  }, [activeSegmentIndex, followPlayback, isBilingualMode]);

  useEffect(() => {
    if (!isBilingualMode || !activeProject) {
      return;
    }

    const existingTranslations = getStoredReaderTranslations(activeProject.id);
    if (existingTranslations?.length === activeProject.segments.length) {
      setProjectTranslations((currentTranslations) => ({
        ...currentTranslations,
        [activeProject.id]: existingTranslations,
      }));
      return;
    }

    if (!isTranslationBusy) {
      handleLoadProjectTranslations(activeProject);
    }
  }, [activeProject, isBilingualMode]);

  useEffect(() => {
    if (!isBilingualMode || !isTranslationVisible) {
      return undefined;
    }

    const englishContainer = splitEnglishContainerRef.current;
    const translationContainer = splitTranslationContainerRef.current;
    if (!englishContainer || !translationContainer) {
      return undefined;
    }

    function releaseScrollLock() {
      if (splitScrollSyncFrameRef.current) {
        cancelAnimationFrame(splitScrollSyncFrameRef.current);
      }

      splitScrollSyncFrameRef.current = requestAnimationFrame(() => {
        isSyncingSplitScrollRef.current = false;
        splitScrollSyncFrameRef.current = null;
      });
    }

    function syncFromEnglish() {
      if (isSyncingSplitScrollRef.current) {
        return;
      }

      isSyncingSplitScrollRef.current = true;
      syncSplitScrollPosition({
        sourceContainer: englishContainer,
        sourceSegmentRefs: splitEnglishSegmentRefs.current,
        targetContainer: translationContainer,
        targetSegmentRefs: splitTranslationSegmentRefs.current,
      });
      releaseScrollLock();
    }

    function syncFromTranslation() {
      if (isSyncingSplitScrollRef.current) {
        return;
      }

      isSyncingSplitScrollRef.current = true;
      syncSplitScrollPosition({
        sourceContainer: translationContainer,
        sourceSegmentRefs: splitTranslationSegmentRefs.current,
        targetContainer: englishContainer,
        targetSegmentRefs: splitEnglishSegmentRefs.current,
      });
      releaseScrollLock();
    }

    function syncFromResize() {
      syncSplitScrollPosition({
        sourceContainer: englishContainer,
        sourceSegmentRefs: splitEnglishSegmentRefs.current,
        targetContainer: translationContainer,
        targetSegmentRefs: splitTranslationSegmentRefs.current,
      });
    }

    englishContainer.addEventListener('scroll', syncFromEnglish, { passive: true });
    translationContainer.addEventListener('scroll', syncFromTranslation, { passive: true });
    window.addEventListener('resize', syncFromResize);
    syncFromResize();

    return () => {
      englishContainer.removeEventListener('scroll', syncFromEnglish);
      translationContainer.removeEventListener('scroll', syncFromTranslation);
      window.removeEventListener('resize', syncFromResize);
      if (splitScrollSyncFrameRef.current) {
        cancelAnimationFrame(splitScrollSyncFrameRef.current);
        splitScrollSyncFrameRef.current = null;
      }
      isSyncingSplitScrollRef.current = false;
    };
  }, [
    activeProjectId,
    activeProject?.segments.length,
    activeProjectHasTranslations,
    isBilingualMode,
    isTranslationVisible,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    if (isBilingualMode) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isBilingualMode]);

  useEffect(() => {
    if (!activeProject?.needsInitialSeek || !audioRef.current) {
      return;
    }

    const chapterStart = activeProject.segments[0]?.start;
    const audioElement = audioRef.current;
    if (!Number.isFinite(chapterStart) || !Number.isFinite(audioElement.duration) || audioElement.duration <= 0) {
      return;
    }

    audioElement.currentTime = chapterStart;
    setSelectedSegmentIndex(0);
    setActiveSegmentIndex(0);
    setCurrentTime(chapterStart);
    setStatus({
      type: 'success',
      message: 'Jumped to the estimated chapter start. Press play when you are ready.',
    });

    const updatedProject = {
      ...activeProject,
      needsInitialSeek: false,
    };

    persistProject(updatedProject).catch((error) => {
      setStatus({ type: 'error', message: error.message });
    });
  }, [activeProject]);

  useEffect(() => {
    function flushProgressBeforeLeaving() {
      maybeSaveReadingProgress('pause');
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushProgressBeforeLeaving();
      }
    }

    window.addEventListener('beforeunload', flushProgressBeforeLeaving);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushProgressBeforeLeaving);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeProjectId, activeSegmentIndex]);

  function updateProjectReadingProgress(projectId, nextProgress) {
    const normalizedProgress = normalizeReaderProgress(nextProgress);

    if (normalizedProgress) {
      setStoredReaderProgress(projectId, normalizedProgress);
    } else {
      clearStoredReaderProgress(projectId);
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (project.id !== projectId) {
          return project;
        }

        const currentProgress = normalizeReaderProgress(project.readingProgress);
        if (
          currentProgress?.time === normalizedProgress?.time &&
          currentProgress?.segmentIndex === normalizedProgress?.segmentIndex &&
          currentProgress?.savedAt === normalizedProgress?.savedAt
        ) {
          return project;
        }

        return {
          ...project,
          readingProgress: normalizedProgress,
        };
      }),
    );
  }

  function updateProjectTranslations(projectId, translations) {
    const normalizedTranslations = normalizeProjectTranslations(translations);

    if (normalizedTranslations) {
      setStoredReaderTranslations(projectId, normalizedTranslations);
    } else {
      clearStoredReaderTranslations(projectId);
    }

    setProjectTranslations((currentTranslations) => {
      const nextTranslations = { ...currentTranslations };
      if (normalizedTranslations) {
        nextTranslations[projectId] = normalizedTranslations;
      } else {
        delete nextTranslations[projectId];
      }
      return nextTranslations;
    });
  }

  async function handleLoadProjectTranslations(projectOverride = activeProject) {
    if (!projectOverride || !projectOverride.segments?.length) {
      return;
    }

    setIsTranslationBusy(true);
    setTranslationError('');

    try {
      const data = await fetchReaderApiJson('/api/reader/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: projectOverride.title,
          lines: projectOverride.segments.map((segment) => segment.text),
        }),
      });

      updateProjectTranslations(projectOverride.id, data.translations);
    } catch (error) {
      setTranslationError(error.message);
    } finally {
      setIsTranslationBusy(false);
    }
  }

  function buildReadingProgressSnapshot(project, timeOverride, segmentIndexOverride) {
    if (!project) {
      return null;
    }

    const snapshotTime = Number(timeOverride);
    if (!Number.isFinite(snapshotTime) || snapshotTime < 1) {
      return null;
    }

    const resolvedSegmentIndex =
      Number.isInteger(segmentIndexOverride) && segmentIndexOverride >= 0
        ? segmentIndexOverride
        : findSegmentIndexByTime(project.segments, snapshotTime);

    return normalizeReaderProgress({
      time: snapshotTime,
      segmentIndex: resolvedSegmentIndex >= 0 ? resolvedSegmentIndex : 0,
      savedAt: new Date().toISOString(),
    });
  }

  function maybeSaveReadingProgress(
    reason,
    timeOverride,
    segmentIndexOverride,
    projectOverride = activeProject,
    options = {},
  ) {
    if (!projectOverride || !audioRef.current) {
      return;
    }

    const nextProgress = buildReadingProgressSnapshot(
      projectOverride,
      Number.isFinite(timeOverride) ? timeOverride : audioRef.current.currentTime,
      segmentIndexOverride,
    );
    if (!nextProgress) {
      return;
    }

    const lastSavedProgress = lastSavedProgressRef.current;
    const sameProject = lastSavedProgress.projectId === projectOverride.id;
    const sameSegment = sameProject && lastSavedProgress.segmentIndex === nextProgress.segmentIndex;
    const timeDelta = sameProject ? Math.abs(nextProgress.time - lastSavedProgress.time) : Infinity;

    if (
      !options.force &&
      reason === 'tick' &&
      sameSegment &&
      timeDelta < 15
    ) {
      return;
    }

    if (
      !options.force &&
      reason !== 'tick' &&
      sameSegment &&
      timeDelta < 1
    ) {
      return;
    }

    lastSavedProgressRef.current = {
      projectId: projectOverride.id,
      time: nextProgress.time,
      segmentIndex: nextProgress.segmentIndex,
    };
    updateProjectReadingProgress(projectOverride.id, nextProgress);
  }

  function flushCurrentProjectProgress() {
    if (!activeProject || !audioRef.current) {
      return;
    }

    const currentTimeSnapshot = audioRef.current.currentTime;
    const currentSegmentIndex = findSegmentIndexByTime(
      activeProject.segments,
      currentTimeSnapshot,
    );
    maybeSaveReadingProgress(
      'switch',
      currentTimeSnapshot,
      currentSegmentIndex,
      activeProject,
      { force: true },
    );
  }

  function handleSelectProject(projectId) {
    if (projectId === activeProjectId) {
      return;
    }

    flushCurrentProjectProgress();
    setActiveProjectId(projectId);
  }

  function applyReaderPosition(time, segmentIndex) {
    if (!audioRef.current || !activeProject) {
      return;
    }

    const duration = Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : Infinity;
    const nextTime = Math.max(0, Math.min(duration, Number(time) || 0));
    const nextSegmentIndex =
      Number.isInteger(segmentIndex) && segmentIndex >= 0
        ? segmentIndex
        : findSegmentIndexByTime(activeProject.segments, nextTime);

    audioRef.current.currentTime = nextTime;
    if (nextSegmentIndex >= 0) {
      setSelectedSegmentIndex(nextSegmentIndex);
      setActiveSegmentIndex(nextSegmentIndex);
    }
    setCurrentTime(nextTime);
  }

  function maybeRestoreReadingProgress(project, duration) {
    const progress = normalizeReaderProgress(project?.readingProgress);
    if (!progress || project?.needsInitialSeek || !audioRef.current || !Number.isFinite(duration) || duration <= 0) {
      return false;
    }

    const restoreKey = `${project.id}:${progress.savedAt || progress.time}`;
    if (restoredProgressKeyRef.current === restoreKey) {
      return false;
    }

    restoredProgressKeyRef.current = restoreKey;
    const restoredTime = Math.min(progress.time, duration);
    applyReaderPosition(restoredTime, findSegmentIndexByTime(project.segments, restoredTime));
    setStatus({
      type: 'success',
      message: `Resumed your saved progress at ${formatTime(progress.time)}.`,
    });
    return true;
  }

  async function handleOpenReadyReaderExample(exampleKey, options = {}) {
    const example = READY_READER_EXAMPLES[exampleKey];
    if (!example) {
      throw new Error(`Unknown ready reader example: "${exampleKey}".`);
    }

    const exampleDisplayName = getReadyReaderDisplayName(example);

    setIsBusy(true);

    try {
      const currentProjects = options.currentProjects || projects;
      const matchingProjects = findMatchingExampleProjects(currentProjects, exampleKey);
      const currentVersionProject = matchingProjects.find(
        (project) => project.sourceExampleVersion === example.version,
      );

      if (currentVersionProject) {
        if (
          example.translationsUrl &&
          (!getStoredReaderTranslations(currentVersionProject.id) ||
            getStoredReaderTranslations(currentVersionProject.id)?.length !== currentVersionProject.segments.length)
        ) {
          const preparedTranslations = await loadPreparedReaderTranslations(example, exampleDisplayName);
          if (preparedTranslations.length !== currentVersionProject.segments.length) {
            throw new Error(
              `The prepared Russian translation for ${exampleDisplayName} did not match the transcript length.`,
            );
          }
          updateProjectTranslations(currentVersionProject.id, preparedTranslations);
        }

        handleSelectProject(currentVersionProject.id);
        setStatus({
          type: 'success',
          message: `Opened the ready reader for ${exampleDisplayName}. It stays in your Library, remembers progress, and keeps the prepared Russian side translation in this browser.`,
        });
        return currentVersionProject;
      }

      const [timingsResponse, preparedTranslations] = await Promise.all([
        fetch(example.timingsUrl),
        loadPreparedReaderTranslations(example, exampleDisplayName),
      ]);
      if (!timingsResponse.ok) {
        throw new Error(`Failed to load the prepared transcript for ${exampleDisplayName}.`);
      }

      const rawTimings = await timingsResponse.text();
      const segments = parseTimedTranscript(rawTimings, example.timingsUrl);
      if (!segments.length) {
        throw new Error(`The prepared transcript for ${exampleDisplayName} did not contain readable segments.`);
      }
      if (preparedTranslations && preparedTranslations.length !== segments.length) {
        throw new Error(
          `The prepared Russian translation for ${exampleDisplayName} did not match the transcript length.`,
        );
      }

      const now = new Date().toISOString();
      const existingProject = matchingProjects[0] || null;
      const project = {
        id: example.projectId,
        title: example.title,
        rawText: segments.map((segment) => segment.text).join('\n\n'),
        segmentationMode: 'sentence',
        timingMode: 'timed',
        audioUrl: example.audioUrl,
        audioBlob: null,
        audioName: example.audioName,
        textName: example.textName,
        timingsName: example.timingsName,
        manualAnchors: {},
        bookmark: existingProject?.bookmark || null,
        readingProgress: getStoredReaderProgress(example.projectId) || existingProject?.readingProgress || null,
        estimatedWindow: null,
        segments,
        audioDuration: existingProject?.audioDuration || null,
        needsSync: false,
        needsInitialSeek: false,
        source: example.source,
        sourceExampleKey: example.sourceExampleKey,
        sourceExampleVersion: example.version,
        createdAt: existingProject?.createdAt || now,
        updatedAt: now,
      };

      await persistProject(project, {
        removeProjectIds: matchingProjects
          .filter((matchingProject) => matchingProject.id !== example.projectId)
          .map((matchingProject) => matchingProject.id),
      });
      if (preparedTranslations) {
        updateProjectTranslations(project.id, preparedTranslations);
      }
      setStatus({
        type: 'success',
        message: `Opened the ready reader for ${exampleDisplayName}. It loads instantly, keeps your progress, and includes the prepared Russian side translation.`,
      });
      return project;
    } finally {
      setIsBusy(false);
    }
  }

  function handleResumeSavedProgress() {
    if (!activeProject?.readingProgress) {
      return;
    }

    const resumeTime = activeProject.readingProgress.time;
    applyReaderPosition(resumeTime, findSegmentIndexByTime(activeProject.segments, resumeTime));
    setStatus({
      type: 'success',
      message: `Jumped back to your saved progress at ${formatTime(activeProject.readingProgress.time)}.`,
    });
  }

  async function persistProject(updatedProject, options = {}) {
    const idsToRemove = new Set((options.removeProjectIds || []).filter(Boolean));
    const savedProject = {
      ...updatedProject,
      updatedAt: new Date().toISOString(),
    };
    const isSwitchingProjects = Boolean(activeProjectId && savedProject.id !== activeProjectId);

    const duplicateIds = [...idsToRemove].filter((projectId) => projectId !== savedProject.id);
    if (duplicateIds.length > 0) {
      await deleteReaderProjects(duplicateIds);
      duplicateIds.forEach((projectId) => {
        clearStoredReaderProgress(projectId);
        updateProjectTranslations(projectId, null);
      });
    }

    if (isSwitchingProjects) {
      flushCurrentProjectProgress();
    }

    await saveReaderProject(savedProject);
    setProjects((currentProjects) => {
      const otherProjects = currentProjects.filter(
        (project) => project.id !== savedProject.id && !idsToRemove.has(project.id),
      );
      return sortProjects([savedProject, ...otherProjects]);
    });
    setActiveProjectId(savedProject.id);
  }

  async function fetchReaderApiJson(path, init = {}) {
    const candidates = buildReaderApiCandidates(path);

    for (let index = 0; index < candidates.length; index += 1) {
      const candidateUrl = candidates[index];
      const isLastCandidate = index === candidates.length - 1;

      try {
        const response = await fetch(candidateUrl, init);
        const rawText = await response.text();
        const contentType = response.headers.get('content-type') || '';
        const data = tryParseJsonResponse(rawText);
        const htmlResponse = isHtmlResponse(rawText, contentType);
        const shouldRetry =
          !isLastCandidate && (htmlResponse || response.status === 404 || response.status === 405);

        if (response.ok && data) {
          return data;
        }

        if (shouldRetry) {
          continue;
        }

        throw new Error(
          data?.error ||
            (htmlResponse ? 'Reader API returned HTML instead of JSON.' : rawText.trim()) ||
            `Reader API request failed with status ${response.status}.`,
        );
      } catch (error) {
        if (isLastCandidate) {
          throw error;
        }
      }
    }

    throw new Error('Reader API request failed.');
  }

  function startBusyProgress(nextProgress) {
    setBusyProgress(normalizeBusyProgress(nextProgress));
  }

  function updateBusyProgress(nextProgress) {
    setBusyProgress((currentProgress) => {
      const normalizedNext = normalizeBusyProgress({
        ...(currentProgress || {}),
        ...(nextProgress || {}),
      });
      return normalizedNext;
    });
  }

  function clearBusyProgress() {
    setBusyProgress(null);
  }

  function buildTimedReaderProject({
    title,
    transcriptData,
    audioUrl = '',
    audioBlob = null,
    audioName = 'Audio',
    textName = 'Transcript text',
    now = new Date().toISOString(),
    extra = {},
  }) {
    const importedTimedSegments = Array.isArray(transcriptData?.segments) ? transcriptData.segments : [];
    if (!importedTimedSegments.length) {
      throw new Error('No timed transcript segments were returned.');
    }

    return {
      id: generateProjectId(),
      title,
      rawText: transcriptData.text || importedTimedSegments.map((segment) => segment.text).join('\n\n'),
      segmentationMode: 'sentence',
      timingMode: 'timed',
      audioUrl,
      audioBlob,
      audioName,
      textName,
      timingsName: transcriptData.timingsName || 'Timed transcript',
      manualAnchors: {},
      bookmark: null,
      readingProgress: null,
      estimatedWindow: null,
      segments: importedTimedSegments,
      audioDuration: transcriptData.audioDurationEstimate || null,
      needsSync: false,
      needsInitialSeek: false,
      createdAt: now,
      updatedAt: now,
      ...extra,
    };
  }

  async function handleCreateProject(event) {
    event.preventDefault();
    setIsBusy(true);

    try {
      const rawTextFromFile = form.textFile ? await readFileAsText(form.textFile) : '';
      const rawTimings = form.timingsFile ? await readFileAsText(form.timingsFile) : '';
      const rawText = (form.text || rawTextFromFile).trim();
      const audioUrl = form.audioUrl.trim();

      if (!rawText && !rawTimings) {
        throw new Error('Add some text or import a timed transcript first.');
      }

      if (!audioUrl && !form.audioFile) {
        throw new Error('Add an audio URL or upload an audio file.');
      }

      let segments = [];
      let timingMode = 'estimated';
      let normalizedText = rawText;

      if (rawTimings) {
        segments = parseTimedTranscript(rawTimings, form.timingsFile?.name || '');
        if (!segments.length) {
          throw new Error('No valid segments were found in the timings file.');
        }

        timingMode = 'timed';
        if (!normalizedText) {
          normalizedText = segments.map((segment) => segment.text).join('\n\n');
        }
      } else {
        segments = splitTextIntoSegments(normalizedText, form.segmentationMode);
        if (!segments.length) {
          throw new Error('The text could not be split into readable segments.');
        }
      }

      const hasWordTimings = segments.some(
        (segment) => Array.isArray(segment.words) && segment.words.length > 0,
      );
      const now = new Date().toISOString();
      const title = form.title.trim() || 'Untitled reader project';
      const project = {
        id: generateProjectId(),
        title,
        rawText: normalizedText,
        segmentationMode: form.segmentationMode,
        timingMode,
        audioUrl,
        audioBlob: form.audioFile || null,
        audioName: form.audioFile?.name || (audioUrl ? 'Remote audio URL' : 'Audio'),
        textName: form.textFile?.name || (normalizedText ? 'Pasted text' : 'Transcript text'),
        timingsName: form.timingsFile?.name || null,
        manualAnchors: {},
        bookmark: null,
        readingProgress: null,
        estimatedWindow: null,
        segments,
        audioDuration: null,
        needsSync: timingMode === 'estimated',
        needsInitialSeek: false,
        createdAt: now,
        updatedAt: now,
      };

      await persistProject(project);
      setForm(createEmptyForm());
      setStatus({
        type: 'success',
        message:
          timingMode === 'timed'
            ? hasWordTimings
              ? `Loaded "${title}" with a timed transcript and word-level highlighting.`
              : `Loaded "${title}" with timed lines. Add JSON word timestamps if you want current-word highlighting too.`
            : `Loaded "${title}" with rough sync. Play the audio to estimate timings.`,
      });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsBusy(false);
    }
  }

  function uploadAudioFileForTranscript(audioFile, audioName) {
    const candidateUrls = buildReaderApiCandidates('/api/reader/transcribe-upload');

    function attemptUpload(candidateIndex) {
      const requestUrl = candidateUrls[candidateIndex];
      const isLastCandidate = candidateIndex === candidateUrls.length - 1;

      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', requestUrl);
        request.setRequestHeader('Content-Type', audioFile.type || 'application/octet-stream');
        request.setRequestHeader('x-lingualearn-audio-name', audioFile.name || audioName || 'Uploaded audio');

        request.upload.onprogress = (event) => {
          if (!event.lengthComputable) {
            return;
          }

          updateBusyProgress({
            label: 'Uploading audio file',
            detail: `Uploading ${audioFile.name || 'audio'} to the server before local transcription starts.`,
            percent: (event.loaded / event.total) * 100,
          });
        };

        request.upload.onload = () => {
          startBusyProgress({
            label: 'Transcribing audio locally',
            detail: 'Upload complete. Local Whisper is processing the audio on the server.',
            percent: null,
          });
        };

        request.onerror = () => {
          if (isLastCandidate) {
            reject(new Error('Failed to upload the audio file for local transcription.'));
            return;
          }

          resolve(attemptUpload(candidateIndex + 1));
        };

        request.onload = () => {
          const rawText = request.responseText || '';
          const contentType = request.getResponseHeader('content-type') || '';
          const data = tryParseJsonResponse(rawText);
          const htmlResponse = isHtmlResponse(rawText, contentType);
          const shouldRetry = !isLastCandidate && (htmlResponse || request.status === 404 || request.status === 405);

          if (request.status >= 200 && request.status < 300 && data) {
            resolve(data);
            return;
          }

          if (shouldRetry) {
            resolve(attemptUpload(candidateIndex + 1));
            return;
          }

          reject(
            new Error(
              data?.error ||
                (htmlResponse ? 'Reader API returned HTML instead of JSON.' : rawText.trim()) ||
                'Failed to transcribe the uploaded audio file.',
            ),
          );
        };

        request.send(audioFile);
      });
    }

    return attemptUpload(0);
  }

  async function requestLocalTranscriptImport(audioUrl, audioFile, audioName) {
    if (audioFile) {
      startBusyProgress({
        label: 'Uploading audio file',
        detail: `Uploading ${audioFile.name || 'audio'} to the server before local transcription starts.`,
        percent: 0,
      });
      return uploadAudioFileForTranscript(audioFile, audioName);
    }

    startBusyProgress({
      label: 'Transcribing audio locally',
      detail: 'The server is downloading the audio and running local Whisper. First run can take a couple of minutes.',
      percent: null,
    });
    return fetchReaderApiJson('/api/reader/transcribe-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioUrl,
        audioName,
      }),
    });
  }

  async function handleCreateTimedTranscriptProject() {
    setIsBusy(true);
    clearBusyProgress();

    try {
      const audioUrl = form.audioUrl.trim();
      if (!audioUrl && !form.audioFile) {
        throw new Error('Add an audio URL or upload an audio file.');
      }

      const now = new Date().toISOString();
      const title = guessProjectTitleFromAudio(form);
      const audioName = form.audioFile?.name || (audioUrl ? 'Remote audio URL' : 'Audio');
      const transcriptData = await requestLocalTranscriptImport(audioUrl, form.audioFile, audioName);
      const project = buildTimedReaderProject({
        title,
        transcriptData,
        audioUrl,
        audioBlob: form.audioFile || null,
        audioName,
        textName: transcriptData.timingsName || 'Local Whisper transcript',
        now,
      });

      await persistProject(project);
      setForm(createEmptyForm());
      setStatus({
        type: 'success',
        message: `Loaded "${title}" with a local timed transcript. Export timings if you want to reuse this transcript later without re-running ASR.`,
      });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      clearBusyProgress();
      setIsBusy(false);
    }
  }

  async function handleImportHpmor(importMode = 'timed', options = {}) {
    setIsBusy(true);
    clearBusyProgress();

    try {
      const chapterNumber = Number.parseInt(options.chapterNumber ?? hpmorChapter, 10);
      if (!Number.isInteger(chapterNumber)) {
        throw new Error('Enter a valid HPMOR chapter number.');
      }

      if (importMode === 'timed') {
        startBusyProgress({
          label: `Transcribing chapter ${chapterNumber} locally`,
          detail: 'The server is fetching the official audio and running local Whisper. First run can take a couple of minutes.',
          percent: null,
        });
      }

      const data = await fetchReaderApiJson(`/api/reader/hpmor/chapter/${chapterNumber}`, {
        headers:
          importMode === 'timed'
            ? {
                'x-lingualearn-import-mode': 'timed',
              }
            : {},
      });

      const now = new Date().toISOString();
      const matchingProjects = findMatchingHpmorProjects(options.currentProjects || projects, chapterNumber);
      const importedTimedSegments =
        data.timingMode === 'timed' && Array.isArray(data.segments) ? data.segments : [];

      if (importedTimedSegments.length > 0) {
        const project = buildTimedReaderProject({
          title: data.title,
          transcriptData: data,
          audioUrl: data.audioUrl,
          audioName: data.audioLabel,
          textName: `HPMOR chapter ${chapterNumber}`,
          now,
          extra: {
            source: data.source,
            sourceChapterNumber: chapterNumber,
            audioSourceType: data.audioSourceType,
            syncHint: data.syncHint,
          },
        });

        await persistProject(project, {
          removeProjectIds: matchingProjects.map((matchingProject) => matchingProject.id),
        });
        setStatus({
          type: 'success',
          message: `${matchingProjects.length > 0 ? 'Replaced the existing Library item for this HPMOR chapter. ' : ''}${data.syncHint}`,
        });
        return project;
      }

      const rawSegments = splitTextIntoSegments(data.text, 'sentence');
      const draftProject = {
        id: generateProjectId(),
        title: data.title,
        rawText: data.text,
        segmentationMode: 'sentence',
        timingMode: 'estimated',
        audioUrl: data.audioUrl,
        audioBlob: null,
        audioName: data.audioLabel,
        textName: `HPMOR chapter ${chapterNumber}`,
        timingsName: `Estimated from ${data.audioSourceType === 'audiobook-part-fallback' ? 'the official audiobook part' : 'the narrowest official podcast episode'}`,
        manualAnchors: {},
        bookmark: null,
        readingProgress: null,
        estimatedWindow: data.estimatedWindow || null,
        segments: [],
        audioDuration: data.audioDurationEstimate,
        needsSync: true,
        needsInitialSeek: true,
        source: data.source,
        sourceChapterNumber: chapterNumber,
        audioSourceType: data.audioSourceType,
        syncHint: data.syncHint,
        createdAt: now,
        updatedAt: now,
      };
      const project = {
        ...draftProject,
        segments: estimateSegmentBoundaries(
          rawSegments,
          data.audioDurationEstimate,
          buildCombinedAnchors(draftProject, data.audioDurationEstimate, rawSegments.length),
        ),
      };

      await persistProject(project, {
        removeProjectIds: matchingProjects.map((matchingProject) => matchingProject.id),
      });
      setStatus({
        type: 'success',
        message: `${matchingProjects.length > 0 ? 'Replaced the existing Library item for this HPMOR chapter. ' : ''}${data.syncHint} LinguaLearn will jump the audio near the estimated chapter start as soon as the metadata loads.`,
      });
      return project;
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
      return null;
    } finally {
      clearBusyProgress();
      setIsBusy(false);
    }
  }

  async function handleAudioMetadata(event) {
    if (!activeProject || !audioRef.current) {
      return;
    }

    if (event?.currentTarget?.dataset?.projectId !== activeProject.id) {
      return;
    }

    const duration = audioRef.current.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    maybeRestoreReadingProgress(activeProject, duration);

    if (activeProject.timingMode !== 'estimated') {
      return;
    }

    if (!activeProject.needsSync && activeProject.audioDuration === duration) {
      return;
    }

    const updatedProject = {
      ...activeProject,
      audioDuration: duration,
      segments: buildEstimatedSegments(activeProject, duration),
      needsSync: false,
      needsInitialSeek: activeProject.needsInitialSeek,
    };

    await persistProject(updatedProject);
  }

  function handleTimeUpdate(event) {
    if (!activeProject || !audioRef.current) {
      return;
    }

    if (event?.currentTarget?.dataset?.projectId !== activeProject.id) {
      return;
    }

    const nextTime = audioRef.current.currentTime;
    setCurrentTime(nextTime);
    const nextIndex = findSegmentIndexByTime(activeProject.segments, nextTime);
    setActiveSegmentIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex));
    maybeSaveReadingProgress('tick', nextTime, nextIndex);
  }

  function handleAudioPause(event) {
    if (!activeProject) {
      return;
    }

    if (event?.currentTarget?.dataset?.projectId !== activeProject.id) {
      return;
    }

    maybeSaveReadingProgress('pause');
  }

  function seekToSegment(segmentIndex) {
    if (!audioRef.current || !activeProject) {
      return;
    }

    const segment = activeProject.segments[segmentIndex];
    if (!segment || !Number.isFinite(segment.start)) {
      return;
    }

    applyReaderPosition(segment.start, segmentIndex);
    maybeSaveReadingProgress('seek', segment.start, segmentIndex);
  }

  async function handleSaveBookmark() {
    if (!activeProject || !audioRef.current) {
      return;
    }

    const bookmarkSegmentIndex = activeSegmentIndex >= 0 ? activeSegmentIndex : selectedSegmentIndex;
    const bookmarkSegment = activeProject.segments[bookmarkSegmentIndex] || selectedSegment;
    const bookmarkTime = Number(audioRef.current.currentTime.toFixed(3));
    const updatedProject = {
      ...activeProject,
      bookmark: {
        time: bookmarkTime,
        segmentIndex: bookmarkSegmentIndex,
        text: bookmarkSegment?.text || '',
      },
    };

    await persistProject(updatedProject);
    setStatus({
      type: 'success',
      message: `Saved a shared bookmark at ${formatTime(bookmarkTime)}.`,
    });
  }

  function handleJumpToBookmark() {
    if (!activeProject?.bookmark || !audioRef.current) {
      return;
    }

    const bookmarkTime = Number(activeProject.bookmark.time);
    const bookmarkSegmentIndex = Number.isInteger(activeProject.bookmark.segmentIndex)
      ? activeProject.bookmark.segmentIndex
      : 0;

    applyReaderPosition(bookmarkTime, bookmarkSegmentIndex);
  }

  async function handleSetAnchor() {
    if (!audioRef.current || !activeProject || activeProject.timingMode !== 'estimated') {
      return;
    }

    const nextManualAnchors = {
      ...activeProject.manualAnchors,
      [selectedSegmentIndex]: Number(audioRef.current.currentTime.toFixed(3)),
    };

    const updatedProject = {
      ...activeProject,
      manualAnchors: nextManualAnchors,
      needsSync: false,
      segments: buildEstimatedSegments(
        { ...activeProject, manualAnchors: nextManualAnchors },
        activeProject.audioDuration || audioRef.current.duration,
      ),
    };

    await persistProject(updatedProject);
    setStatus({
      type: 'success',
      message: `Pinned segment ${selectedSegmentIndex + 1} at ${formatTime(audioRef.current.currentTime)}.`,
    });
  }

  async function handleClearAnchor() {
    if (!activeProject || activeProject.timingMode !== 'estimated') {
      return;
    }

    if (!Number.isFinite(activeProject.manualAnchors?.[selectedSegmentIndex])) {
      return;
    }

    const nextManualAnchors = { ...activeProject.manualAnchors };
    delete nextManualAnchors[selectedSegmentIndex];

    const updatedProject = {
      ...activeProject,
      manualAnchors: nextManualAnchors,
      needsSync: false,
      segments: buildEstimatedSegments(
        { ...activeProject, manualAnchors: nextManualAnchors },
        activeProject.audioDuration || audioRef.current?.duration,
      ),
    };

    await persistProject(updatedProject);
    setStatus({ type: 'success', message: `Removed anchor from segment ${selectedSegmentIndex + 1}.` });
  }

  async function handleResetEstimates() {
    if (!activeProject || activeProject.timingMode !== 'estimated') {
      return;
    }

    const updatedProject = {
      ...activeProject,
      manualAnchors: {},
      needsSync: false,
      segments: buildEstimatedSegments(
        { ...activeProject, manualAnchors: {} },
        activeProject.audioDuration || audioRef.current?.duration,
      ),
    };

    await persistProject(updatedProject);
    setStatus({ type: 'success', message: 'Rough sync reset to the original estimate.' });
  }

  async function handleDeleteProject(projectId) {
    if (!confirm('Delete this reader project?')) {
      return;
    }

    await deleteReaderProject(projectId);
    clearStoredReaderProgress(projectId);
    updateProjectTranslations(projectId, null);
    setProjects((currentProjects) => currentProjects.filter((project) => project.id !== projectId));

    if (activeProjectId === projectId) {
      const nextProject = projects.find((project) => project.id !== projectId);
      setActiveProjectId(nextProject?.id || null);
    }

    setStatus({ type: 'success', message: 'Reader project deleted.' });
  }

  async function handleResetHpmorProjects() {
    const hpmorProjects = getHpmorProjects(projects);
    if (!hpmorProjects.length) {
      setStatus({ type: 'idle', message: 'No imported HPMOR chapters to remove.' });
      return;
    }

    if (
      !confirm(
        `Delete ${hpmorProjects.length} imported HPMOR chapter${
          hpmorProjects.length === 1 ? '' : 's'
        } and start from scratch?`,
      )
    ) {
      return;
    }

    const hpmorProjectIds = hpmorProjects.map((project) => project.id);
    await deleteReaderProjects(hpmorProjectIds);
    hpmorProjectIds.forEach((projectId) => {
      clearStoredReaderProgress(projectId);
      updateProjectTranslations(projectId, null);
    });

    const remainingProjects = projects.filter((project) => !hpmorProjectIds.includes(project.id));
    setProjects(remainingProjects);
    if (!remainingProjects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(remainingProjects[0]?.id || null);
    }

    markLegacyHpmorResetApplied();
    setStatus({ type: 'success', message: 'Removed imported HPMOR chapters. Start from scratch.' });
  }

  function handleExportProject() {
    if (!activeProject) {
      return;
    }

    downloadJson(
      `${activeProject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'reader-project'}-timings.json`,
      exportSegmentsToJson(activeProject),
    );
  }

  function handleJump(seconds) {
    if (!audioRef.current) {
      return;
    }

    const duration = Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : Infinity;
    const nextTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
    applyReaderPosition(nextTime, findSegmentIndexByTime(activeProject?.segments || [], nextTime));
    maybeSaveReadingProgress('seek', nextTime, findSegmentIndexByTime(activeProject?.segments || [], nextTime));
  }

  const selectedSegment = activeProject?.segments[selectedSegmentIndex] || null;
  const activeSegment = activeProject?.segments[activeSegmentIndex] || null;
  const activeBookmark = activeProject?.bookmark || null;
  const activeReadingProgress = normalizeReaderProgress(activeProject?.readingProgress);
  const activeWordIndex = activeSegment ? findActiveWordIndex(activeSegment.words, currentTime) : -1;
  const activeProjectHasWordTimings = activeProject?.segments?.some(
    (segment) => Array.isArray(segment.words) && segment.words.length > 0,
  );
  const translationStatusLabel = activeProjectHasTranslations
    ? `${activeProjectTranslations.length} translated lines`
    : isTranslationBusy
      ? 'generating translation'
      : 'generate on demand';
  const isPreparingChapterStart = Boolean(activeProject?.needsInitialSeek && audioSource);
  const hpmorProjectCount = getHpmorProjects(projects).length;
  const readyChapter4Href = buildReaderExampleHref('hpmor-chapter-4');
  const readyChapter12Href = buildReaderExampleHref('hpmor-chapter-12');
  const isRoughHpmorChapter4 =
    activeProject?.source === 'hpmor' &&
    activeProject?.sourceChapterNumber === 4 &&
    activeProject?.timingMode === 'estimated';

  function renderSegmentWords(segment, activeWordPosition) {
    if (!Array.isArray(segment.words) || !segment.words.length) {
      return segment.text;
    }

    return segment.words.map((word, wordIndex) => {
      const wordText = word.text || '';
      const leadingWhitespace = wordText.match(/^\s*/)?.[0] || '';
      const visibleText = wordText.slice(leadingWhitespace.length) || wordText;

      return (
        <React.Fragment key={`${segment.id}-word-${wordIndex}`}>
          {leadingWhitespace}
          {wordIndex === activeWordPosition ? (
            <span
              data-testid="active-word"
              className="rounded bg-yellow-300 px-0.5 py-0.5 text-gray-900 shadow-sm"
            >
              {visibleText}
            </span>
          ) : (
            visibleText
          )}
        </React.Fragment>
      );
    });
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} rounded-2xl shadow-2xl p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-3">
              <Headphones className="h-8 w-8 text-yellow-500" />
              Sync Reader
            </h2>
            <p className={`${subtextClass} mt-2 max-w-3xl`}>
              Build a synced reading experience from any text + audio pair. The MVP starts with rough
              timing based on text length, then lets you pin manual anchors or import exact timings from
              JSON, SRT, or VTT. For clean English audio, you can also generate a local timed transcript
              directly in the reader.
            </p>
          </div>

          <div className={`rounded-2xl border p-4 ${softCardClass}`}>
            <p className="font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-500" />
              HPMOR quick start
            </p>
            <ol className={`mt-2 list-decimal list-inside text-sm space-y-1 ${subtextClass}`}>
              <li>Copy one chapter from the official HPMOR mirror.</li>
              <li>Paste the matching podcast MP3 URL or upload the audio file.</li>
              <li>Use sentence mode for tighter rough sync, then pin anchors where it drifts.</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={HPMOR_TEXT_URL}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-lg bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-semibold"
              >
                Open HPMOR text
              </a>
              <a
                href={HPMOR_AUDIO_URL}
                target="_blank"
                rel="noreferrer"
                className={`px-3 py-2 rounded-lg border font-semibold ${borderClass}`}
              >
                Open HPMOR audio
              </a>
            </div>

            <div className={`mt-4 rounded-xl border p-4 ${softCardClass}`}>
              <p className="text-sm font-semibold">One-click HPMOR import</p>
              <p className={`mt-1 text-xs ${subtextClass}`}>
                Import chapter now uses local Whisper to build a timed transcript from the narrowest official
                HPMOR audio file available. Use rough import only when you explicitly want manual pinning.
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  type="number"
                  min="1"
                  max="122"
                  value={hpmorChapter}
                  onChange={(event) => setHpmorChapter(event.target.value)}
                  className={`w-full rounded-xl border-2 px-4 py-3 focus:outline-none focus:border-yellow-400 ${inputClass}`}
                  placeholder="Chapter number"
                />
                <button
                  type="button"
                  onClick={() => handleImportHpmor('timed')}
                  disabled={isBusy}
                  className="rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900 whitespace-nowrap disabled:opacity-60"
                >
                  Import chapter
                </button>
                <button
                  type="button"
                  onClick={() => handleImportHpmor('rough')}
                  disabled={isBusy}
                  className={`rounded-xl border px-4 py-3 font-semibold whitespace-nowrap disabled:opacity-60 ${borderClass}`}
                >
                  Import rough sync
                </button>
              </div>
              <p className={`mt-2 text-xs ${subtextClass}`}>
                Note: timed import can take a while on the first run because local Whisper has to
                transcribe the audio once, then the result is cached on the server.
              </p>
            </div>

            <div className={`mt-4 rounded-xl border p-4 ${softCardClass}`}>
              <p className="text-sm font-semibold">Ready examples: chapters 4 and 12</p>
              <p className={`mt-1 text-xs ${subtextClass}`}>
                Skip transcript prep. These open instantly with prepared transcripts and keep your
                progress in this browser.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenReadyReaderExample('hpmor-chapter-4')}
                  disabled={isBusy}
                  className="rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900 disabled:opacity-60"
                >
                  Open ready chapter 4
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenReadyReaderExample('hpmor-chapter-12')}
                  disabled={isBusy}
                  className="rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900 disabled:opacity-60"
                >
                  Open ready chapter 12
                </button>
                <a
                  href={readyChapter4Href}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold text-center ${borderClass}`}
                >
                  Direct link for ready chapter 4
                </a>
                <a
                  href={readyChapter12Href}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold text-center ${borderClass}`}
                >
                  Direct link for ready chapter 12
                </a>
              </div>
            </div>
          </div>
        </div>

        {status.message && (
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
              status.type === 'error'
                ? 'bg-red-100 text-red-800'
                : status.type === 'success'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-blue-100 text-blue-800'
            }`}
          >
            {status.message}
          </div>
        )}

        {busyProgress && (
          <div
            data-testid="reader-progress"
            className={`mt-4 rounded-xl border px-4 py-4 ${softCardClass}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{busyProgress.label}</p>
              <span className={`text-xs font-semibold ${accentTextClass}`}>
                {Number.isFinite(busyProgress.percent) ? `${Math.round(busyProgress.percent)}%` : 'In progress'}
              </span>
            </div>
            {busyProgress.detail && (
              <p className={`mt-1 text-xs ${subtextClass}`}>{busyProgress.detail}</p>
            )}
            <div
              className={`mt-3 h-2 overflow-hidden rounded-full ${isDark ? 'bg-slate-700' : 'bg-yellow-100'}`}
            >
              <div
                data-testid="reader-progress-bar"
                className={`h-full rounded-full bg-gradient-to-r from-yellow-400 to-lime-400 transition-all duration-300 ${
                  Number.isFinite(busyProgress.percent) ? '' : 'animate-pulse'
                }`}
                style={{ width: `${Number.isFinite(busyProgress.percent) ? Math.max(busyProgress.percent, 6) : 42}%` }}
              />
            </div>
            <p className={`mt-2 text-xs ${subtextClass}`}>
              {Number.isFinite(busyProgress.percent)
                ? 'Uploading audio to the server.'
                : 'Processing on the server. The exact percent is not available yet.'}
            </p>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className={`${cardClass} rounded-2xl shadow-2xl p-6`}>
            <h3 className="text-2xl font-bold flex items-center gap-2">
              <Plus className="h-6 w-6 text-yellow-500" />
              Create Reader Project
            </h3>
            <p className={`${subtextClass} mt-2 text-sm`}>
              Import a chapter, article, podcast transcript, or audiobook slice. Timings are optional,
              and for clean English audio you can ask the server to transcribe it locally into a timed
              project.
            </p>

            <form className="mt-5 space-y-4" onSubmit={handleCreateProject}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Project title</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="HPMOR - Chapter 1"
                  className={`w-full rounded-xl border-2 px-4 py-3 focus:outline-none focus:border-yellow-400 ${inputClass}`}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-yellow-500" />
                  Text
                </span>
                <textarea
                  value={form.text}
                  onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))}
                  placeholder="Paste chapter text here, or upload a .txt/.md file below."
                  rows="6"
                  className={`w-full rounded-xl border-2 px-4 py-3 focus:outline-none focus:border-yellow-400 ${inputClass}`}
                />
              </label>
              <p className={`text-xs ${subtextClass}`}>
                If you use local transcription below, pasted text is optional. The synced reader will use
                the spoken transcript returned from the audio itself.
              </p>

              <label className={`block rounded-xl border-2 border-dashed px-4 py-3 ${borderClass}`}>
                <span className="text-sm font-semibold flex items-center gap-2">
                  <Upload className="h-4 w-4 text-yellow-500" />
                  Upload text file
                </span>
                <input
                  type="file"
                  accept=".txt,.md"
                  className="mt-2 block w-full text-sm"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, textFile: event.target.files?.[0] || null }))
                  }
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-yellow-500" />
                  Audio URL
                </span>
                <input
                  type="url"
                  value={form.audioUrl}
                  onChange={(event) => setForm((current) => ({ ...current, audioUrl: event.target.value }))}
                  placeholder="https://..."
                  className={`w-full rounded-xl border-2 px-4 py-3 focus:outline-none focus:border-yellow-400 ${inputClass}`}
                />
              </label>

              <label className={`block rounded-xl border-2 border-dashed px-4 py-3 ${borderClass}`}>
                <span className="text-sm font-semibold flex items-center gap-2">
                  <FileAudio className="h-4 w-4 text-yellow-500" />
                  Upload audio file
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  className="mt-2 block w-full text-sm"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, audioFile: event.target.files?.[0] || null }))
                  }
                />
              </label>

              <label className={`block rounded-xl border-2 border-dashed px-4 py-3 ${borderClass}`}>
                <span className="text-sm font-semibold flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-yellow-500" />
                  Optional timings (JSON, SRT, VTT)
                </span>
                <input
                  type="file"
                  accept=".json,.srt,.vtt"
                  className="mt-2 block w-full text-sm"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, timingsFile: event.target.files?.[0] || null }))
                  }
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Segmentation mode</span>
                <select
                  value={form.segmentationMode}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, segmentationMode: event.target.value }))
                  }
                  className={`w-full rounded-xl border-2 px-4 py-3 focus:outline-none focus:border-yellow-400 ${inputClass}`}
                >
                  <option value="paragraph">Paragraphs (best for chapters)</option>
                  <option value="sentence">Sentences (best for HPMOR/audio drilling)</option>
                </select>
              </label>

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900 shadow-md disabled:opacity-60"
                >
                  {isBusy ? 'Working...' : 'Create Reader Project'}
                </button>
                <button
                  type="button"
                  onClick={handleCreateTimedTranscriptProject}
                  disabled={isBusy}
                  className={`w-full rounded-xl border px-4 py-3 font-semibold shadow-sm disabled:opacity-60 ${borderClass}`}
                >
                  {isBusy ? 'Working...' : 'Transcribe Audio Locally'}
                </button>
              </div>
              <p className={`text-xs ${subtextClass}`}>
                `Transcribe Audio Locally` works best for clear English speech. First run on a new audio
                file can take a couple of minutes on CPU, then you can export the timings JSON and reuse it.
              </p>
            </form>
          </section>

          <section className={`${cardClass} rounded-2xl shadow-2xl p-6`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-2xl font-bold">Library</h3>
                <p className={`${subtextClass} mt-2 text-sm`}>
                  Saved locally in your browser with text, timings, uploaded audio files, and your reading
                  progress.
                </p>
              </div>

              {hpmorProjectCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetHpmorProjects}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
                >
                  Reset HPMOR chapters ({hpmorProjectCount})
                </button>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {projects.length === 0 && (
                <div className={`rounded-xl border p-4 text-sm ${softCardClass}`}>
                  No reader projects yet. Create your first HPMOR chapter above.
                </div>
              )}

              {projects.map((project) => {
                const badges = getSegmentBadges(project);
                const summary = buildProjectSummary(project);
                const isActive = project.id === activeProjectId;

                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handleSelectProject(project.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      isActive
                        ? 'border-yellow-400 bg-gradient-to-r from-yellow-100 to-lime-100 text-gray-900 shadow-lg'
                        : `${softCardClass} hover:border-yellow-300`
                    }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{project.title}</p>
                          <p className={`mt-1 text-xs ${isActive ? 'text-gray-700' : subtextClass}`}>
                            {badges.modeLabel} · {badges.segmentCount} segments · {summary.firstTime} →{' '}
                            {summary.lastTime}
                          </p>
                          {project.readingProgress && (
                            <p className={`mt-2 text-xs font-semibold ${isActive ? 'text-sky-800' : 'text-sky-700'}`}>
                              Resume from {formatTime(project.readingProgress.time)}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {project.readingProgress && (
                            <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-900">
                              progress {formatTime(project.readingProgress.time)}
                            </span>
                          )}
                          {badges.manualAnchors > 0 && (
                            <span className="rounded-full bg-yellow-200 px-2 py-1 text-xs font-semibold text-yellow-900">
                              {badges.manualAnchors} pins
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {!activeProject && (
            <section className={`${cardClass} rounded-2xl shadow-2xl p-10 text-center`}>
              <Headphones className="mx-auto h-16 w-16 text-yellow-500" />
              <h3 className="mt-4 text-2xl font-bold">Open a chapter and start syncing</h3>
              <p className={`${subtextClass} mt-2 max-w-2xl mx-auto`}>
                This reader is designed for HPMOR-style text + audio practice, but it also works for any
                audiobook, podcast transcript, or custom shadowing material you want to drill.
              </p>
            </section>
          )}

          {activeProject && (
            <>
              <section className={`${cardClass} rounded-2xl shadow-2xl p-6`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-3xl font-bold">{activeProject.title}</h3>
                    <p className={`${subtextClass} mt-2`}>
                      {activeProject.timingMode === 'timed'
                        ? activeProjectHasWordTimings
                          ? 'Exact timings are loaded with word-level highlighting.'
                          : 'Exact line timings are loaded. Add word-aware JSON if you want current-word highlighting too.'
                        : activeProject.syncHint ||
                          'Rough sync is estimated from text length. Use manual anchors where it drifts.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-900">
                        {getSegmentBadges(activeProject).modeLabel}
                      </span>
                      <span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-semibold text-lime-900">
                        {activeProject.segments.length} segments
                      </span>
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-900">
                        {activeProject.audioName}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIsBilingualMode((currentValue) => !currentValue)}
                      disabled={isTranslationBusy && !activeProjectHasTranslations}
                      className={`rounded-xl border px-4 py-2 font-semibold flex items-center gap-2 ${borderClass} disabled:opacity-60`}
                    >
                      {isTranslationBusy && isBilingualMode && !activeProjectHasTranslations ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : isBilingualMode ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Columns2 className="h-4 w-4" />
                      )}
                      {isBilingualMode ? 'Close bilingual reader' : 'Open EN/RU reader'}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportProject}
                      className={`rounded-xl border px-4 py-2 font-semibold flex items-center gap-2 ${borderClass}`}
                    >
                      <Download className="h-4 w-4" />
                      Export timings
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(activeProject.id)}
                      className="rounded-xl bg-red-500 px-4 py-2 font-semibold text-white flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete project
                    </button>
                  </div>
                </div>

                {isRoughHpmorChapter4 && (
                  <div className="mt-4 rounded-2xl border border-lime-200 bg-lime-50 px-4 py-4 text-sm text-lime-900">
                    <p className="font-semibold">This is the rough auto-import version of chapter 4.</p>
                    <p className="mt-1">
                      If you want the simpler ready-to-read version with exact line timings, current-word
                      highlight, and saved progress, open the prepared chapter 4 reader instead.
                    </p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => handleOpenReadyReaderExample('hpmor-chapter-4')}
                        disabled={isBusy}
                        className="rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900 disabled:opacity-60"
                      >
                        Open ready chapter 4 now
                      </button>
                      <a
                        href={readyChapter4Href}
                        className="rounded-xl border border-lime-300 px-4 py-3 font-semibold text-center"
                      >
                        Direct chapter 4 link
                      </a>
                    </div>
                  </div>
                )}
              </section>

              {isBilingualMode && (
                <div
                  className={`fixed inset-0 z-40 ${
                    isDark ? 'bg-slate-950/94 text-gray-100' : 'bg-amber-50/95 text-gray-900'
                  } backdrop-blur-sm`}
                >
                  <div className="mx-auto flex h-full max-w-[1600px] flex-col px-4 pb-36 pt-4 md:px-6 md:pb-40 md:pt-6">
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-yellow-500">
                          Bilingual Reader
                        </p>
                        <h4 className="mt-1 text-2xl font-bold">{activeProject.title}</h4>
                        <p className={`mt-2 text-sm ${subtextClass}`}>
                          English on the left, quick Russian sense translation on the right. Space still
                          plays or pauses the audio.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadProjectTranslations(activeProject)}
                          disabled={isTranslationBusy}
                          className={`rounded-xl border px-4 py-2 font-semibold flex items-center gap-2 ${borderClass} disabled:opacity-60`}
                        >
                          {isTranslationBusy ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          {activeProjectHasTranslations ? 'Refresh Russian' : 'Load Russian'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsTranslationVisible((currentValue) => !currentValue)}
                          className={`rounded-xl border px-4 py-2 font-semibold flex items-center gap-2 ${borderClass}`}
                        >
                          {isTranslationVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          {isTranslationVisible ? 'Hide Russian' : 'Show Russian'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsTranslationFirst((currentValue) => !currentValue)}
                          disabled={!isTranslationVisible}
                          className={`rounded-xl border px-4 py-2 font-semibold flex items-center gap-2 ${borderClass} disabled:opacity-60`}
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                          Swap columns
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsBilingualMode(false)}
                          className="rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-2 font-bold text-gray-900"
                        >
                          Close reader
                        </button>
                      </div>
                    </div>

                    <div className={`grid min-h-0 flex-1 grid-cols-1 gap-4 ${isTranslationVisible ? 'xl:grid-cols-2' : ''}`}>
                      <section
                        className={`${cardClass} min-h-0 rounded-3xl border shadow-2xl ${borderClass} p-5 ${
                          isTranslationFirst ? 'xl:order-2' : 'xl:order-1'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">English</p>
                            <p className={`mt-1 text-xs ${subtextClass}`}>
                              Click any line to jump there.
                            </p>
                          </div>
                          <span className={`text-xs font-semibold ${accentTextClass}`}>
                            {activeSegmentIndex >= 0 ? `Line ${activeSegmentIndex + 1}` : 'Ready'}
                          </span>
                        </div>

                        <div
                          ref={splitEnglishContainerRef}
                          data-testid="split-english-scroll"
                          className={`mt-4 h-full overflow-y-auto rounded-2xl border p-4 ${softCardClass}`}
                        >
                          <div className="space-y-3 text-base leading-7">
                            {activeProject.segments.map((segment) => {
                              const isSelected = selectedSegmentIndex === segment.index;
                              const isActive = activeSegmentIndex === segment.index;
                              const segmentWordIndex = isActive ? activeWordIndex : -1;

                              return (
                                <button
                                  key={`split-en-${segment.id}`}
                                  type="button"
                                  ref={(element) => {
                                    splitEnglishSegmentRefs.current[segment.index] = element;
                                  }}
                                  onClick={() => {
                                    setSelectedSegmentIndex(segment.index);
                                    if (Number.isFinite(segment.start)) {
                                      seekToSegment(segment.index);
                                    }
                                  }}
                                  className={`block w-full rounded-2xl px-4 py-3 text-left transition-all ${
                                    isActive
                                      ? 'bg-lime-200 text-gray-900 shadow-sm'
                                      : isSelected
                                        ? 'bg-yellow-100 text-gray-900'
                                        : `${cardClass} hover:bg-yellow-50/80`
                                  }`}
                                >
                                  {renderSegmentWords(segment, segmentWordIndex)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </section>

                      {isTranslationVisible && (
                      <section
                        className={`${cardClass} min-h-0 rounded-3xl border shadow-2xl ${borderClass} p-5 ${
                          isTranslationFirst ? 'xl:order-1' : 'xl:order-2'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">Russian</p>
                            <p className={`mt-1 text-xs ${subtextClass}`}>
                              Fast meaning-oriented translation for side-by-side reading.
                            </p>
                          </div>
                          <span className={`text-xs font-semibold ${accentTextClass}`}>
                            {translationStatusLabel}
                          </span>
                        </div>

                        <div
                          ref={splitTranslationContainerRef}
                          data-testid="split-translation-scroll"
                          className={`mt-4 h-full overflow-y-auto rounded-2xl border p-4 ${softCardClass}`}
                        >
                          {isTranslationBusy && !activeProjectHasTranslations ? (
                            <div className="flex h-full min-h-[18rem] flex-col items-center justify-center text-center">
                              <RefreshCw className="h-8 w-8 animate-spin text-yellow-500" />
                              <p className="mt-4 text-lg font-semibold">Generating Russian side text</p>
                              <p className={`mt-2 max-w-md text-sm ${subtextClass}`}>
                                Quality is tuned for quick comprehension, not literary polish.
                              </p>
                            </div>
                          ) : translationError && !activeProjectHasTranslations ? (
                            <div className="flex h-full min-h-[18rem] flex-col items-center justify-center text-center">
                              <p className="text-lg font-semibold text-red-600">Translation failed</p>
                              <p className={`mt-2 max-w-md text-sm ${subtextClass}`}>{translationError}</p>
                              <button
                                type="button"
                                onClick={() => handleLoadProjectTranslations(activeProject)}
                                className="mt-4 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900"
                              >
                                Retry Russian translation
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3 text-base leading-7">
                              {activeProject.segments.map((segment) => {
                                const isSelected = selectedSegmentIndex === segment.index;
                                const isActive = activeSegmentIndex === segment.index;
                                const translatedText = activeProjectHasTranslations
                                  ? activeProjectTranslations[segment.index]
                                  : 'Translation will appear here.';

                                return (
                                  <button
                                    key={`split-ru-${segment.id}`}
                                    type="button"
                                    ref={(element) => {
                                      splitTranslationSegmentRefs.current[segment.index] = element;
                                    }}
                                    onClick={() => {
                                      setSelectedSegmentIndex(segment.index);
                                      if (Number.isFinite(segment.start)) {
                                        seekToSegment(segment.index);
                                      }
                                    }}
                                    className={`block w-full rounded-2xl px-4 py-3 text-left transition-all ${
                                      isActive
                                        ? 'bg-sky-200 text-gray-900 shadow-sm'
                                        : isSelected
                                          ? 'bg-yellow-100 text-gray-900'
                                          : `${cardClass} hover:bg-yellow-50/80`
                                    }`}
                                  >
                                    {translatedText}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </section>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <section
                className={`${cardClass} ${
                  isBilingualMode
                    ? 'fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[1600px] rounded-t-3xl border-x-0 border-b-0 p-4 shadow-2xl'
                    : 'rounded-2xl shadow-2xl p-6'
                }`}
              >
                {isPreparingChapterStart && (
                  <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">
                    Preparing the estimated start of this chapter. Play controls will unlock in a moment so
                    you do not hear the wrong chapter first.
                  </div>
                )}
                <audio
                  key={activeProject.id}
                  data-project-id={activeProject.id}
                  ref={audioRef}
                  controls={!isPreparingChapterStart}
                  preload="metadata"
                  src={audioSource}
                  onLoadedMetadata={handleAudioMetadata}
                  onPause={handleAudioPause}
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full"
                />

                {isBilingualMode ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleJump(-5)}
                        className={`rounded-xl border px-4 py-2 font-semibold ${borderClass}`}
                      >
                        -5s
                      </button>
                      <button
                        type="button"
                        onClick={() => handleJump(5)}
                        className={`rounded-xl border px-4 py-2 font-semibold ${borderClass}`}
                      >
                        +5s
                      </button>
                      <label className={`rounded-xl border px-4 py-2 font-semibold ${borderClass}`}>
                        Speed
                        <select
                          value={playbackRate}
                          onChange={(event) => setPlaybackRate(Number(event.target.value))}
                          className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm ${inputClass}`}
                        >
                          {[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((speed) => (
                            <option key={speed} value={speed}>
                              {speed}x
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setFollowPlayback((currentValue) => !currentValue)}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                          followPlayback
                            ? 'border-lime-400 bg-lime-100 text-lime-900'
                            : `${borderClass} ${cardClass}`
                        }`}
                      >
                        {followPlayback ? 'Follow: on' : 'Follow: off'}
                      </button>
                      <div className={`rounded-xl border px-4 py-2 ${borderClass}`}>
                        <p className="text-xs font-semibold">Current line</p>
                        <p className={`mt-1 text-sm ${accentTextClass}`}>
                          {activeSegmentIndex >= 0 ? `${activeSegmentIndex + 1} / ${activeProject.segments.length}` : '—'}
                        </p>
                      </div>
                      <div className={`rounded-xl border px-4 py-2 ${borderClass}`}>
                        <p className="text-xs font-semibold">Current text</p>
                        <p className="mt-1 max-w-[32rem] truncate text-sm">
                          {activeSegment?.text || 'Press play to begin.'}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => handleJump(-5)}
                        className={`rounded-xl border px-4 py-3 font-semibold ${borderClass}`}
                      >
                        -5s
                      </button>
                      <button
                        type="button"
                        onClick={() => handleJump(5)}
                        className={`rounded-xl border px-4 py-3 font-semibold ${borderClass}`}
                      >
                        +5s
                      </button>
                      <label className={`rounded-xl border px-4 py-3 font-semibold ${borderClass}`}>
                        Speed
                        <select
                          value={playbackRate}
                          onChange={(event) => setPlaybackRate(Number(event.target.value))}
                          className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm ${inputClass}`}
                        >
                          {[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((speed) => (
                            <option key={speed} value={speed}>
                              {speed}x
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={`rounded-xl border px-4 py-3 ${borderClass}`}>
                        <p className="text-sm font-semibold">Current line</p>
                        <p className={`mt-2 text-sm ${accentTextClass}`}>
                          {activeSegmentIndex >= 0 ? `${activeSegmentIndex + 1} / ${activeProject.segments.length}` : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setFollowPlayback((currentValue) => !currentValue)}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                          followPlayback
                            ? 'border-lime-400 bg-lime-100 text-lime-900'
                            : `${borderClass} ${cardClass}`
                        }`}
                      >
                        {followPlayback ? 'Follow playback: on' : 'Follow playback: off'}
                      </button>
                      <p className={`text-xs ${subtextClass}`}>
                        Off by default so the page stays still. Press <span className="font-semibold">Space</span>{' '}
                        to play or pause whenever you are not typing in a field.
                      </p>
                    </div>

                    {activeReadingProgress && (
                      <div className={`mt-4 rounded-2xl border p-4 ${softCardClass}`}>
                        <p className="text-sm font-semibold">Saved progress</p>
                        <p className={`mt-1 text-xs ${subtextClass}`}>
                          LinguaLearn remembers this spot in your browser, so you can leave and continue later
                          without loading the transcript again.
                        </p>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className={`text-sm font-semibold ${accentTextClass}`}>
                            Continue from {formatTime(activeReadingProgress.time)}
                          </p>
                          <button
                            type="button"
                            onClick={handleResumeSavedProgress}
                            className="rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900"
                          >
                            Continue where I stopped
                          </button>
                        </div>
                      </div>
                    )}

                    <div className={`mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]`}>
                      <div className={`rounded-2xl border p-5 ${softCardClass} min-h-[9rem] max-h-[16rem] overflow-y-auto`}>
                        <p className="text-sm font-semibold">Current line</p>
                        <p className="mt-3 text-lg leading-relaxed">
                          {activeSegment?.text || 'Press play to let the reader follow your audio.'}
                        </p>
                        {Array.isArray(activeSegment?.words) && activeWordIndex >= 0 && (
                          <p className={`mt-3 text-xs font-medium ${subtextClass}`}>
                            Current word:{' '}
                            <span className={accentTextClass}>
                              {String(activeSegment.words[activeWordIndex]?.text || '').trim() || '—'}
                            </span>
                          </p>
                        )}
                        {activeProject?.timingMode === 'timed' && !activeProjectHasWordTimings && (
                          <p className={`mt-3 text-xs ${subtextClass}`}>
                            This transcript has line timings only. Current-word highlighting appears when the
                            imported JSON also includes per-word timestamps.
                          </p>
                        )}
                      </div>

                      <div className={`rounded-2xl border p-5 ${softCardClass}`}>
                        <p className="text-sm font-semibold">Shared bookmark</p>
                        <p className={`mt-2 text-xs ${subtextClass}`}>
                          One bookmark ties the audio position and the matching text line together.
                        </p>
                        <p data-testid="shared-bookmark-time" className={`mt-3 text-sm ${accentTextClass}`}>
                          {activeBookmark ? formatTime(activeBookmark.time) : 'No bookmark yet'}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed">
                          {activeBookmark ? getBookmarkSnippet(activeBookmark) : 'Save the current spot whenever you want to come back later.'}
                        </p>
                        {activeReadingProgress && (
                          <p className={`mt-3 text-xs ${subtextClass}`}>
                            Auto-saved progress: {formatTime(activeReadingProgress.time)}
                          </p>
                        )}
                        <div className="mt-4 flex flex-col gap-3">
                          <button
                            type="button"
                            onClick={handleSaveBookmark}
                            className={`w-full rounded-xl border px-4 py-3 font-semibold flex items-center justify-center gap-2 ${borderClass}`}
                          >
                            <Bookmark className="h-4 w-4" />
                            Save bookmark here
                          </button>
                          <button
                            type="button"
                            onClick={handleJumpToBookmark}
                            disabled={!activeBookmark}
                            className="w-full rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900 disabled:opacity-60"
                          >
                            Jump to bookmark
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </section>

              {!isBilingualMode && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
                <section className={`${cardClass} rounded-2xl shadow-2xl p-6`}>
                  <h4 className="text-xl font-bold">
                    {activeProject.timingMode === 'timed' ? 'Navigation & bookmark' : 'Navigation & manual sync'}
                  </h4>
                  <p className={`${subtextClass} mt-2 text-sm`}>
                    {activeProject.timingMode === 'timed'
                      ? 'Jump through the transcript, keep one shared bookmark, and let the highlighted line track the audio.'
                      : 'Best for HPMOR or audiobook chapters without subtitles: jump to a line, play until it drifts, then pin the current time.'}
                  </p>

                  <div className={`mt-4 rounded-xl border p-4 ${softCardClass}`}>
                    <p className="text-sm font-semibold">Selected line</p>
                    <p className="mt-2 text-sm leading-relaxed">
                      {selectedSegment?.text || 'Select a line from the reader text.'}
                    </p>
                    <div className={`mt-3 text-xs ${subtextClass}`}>
                      Start: {formatTime(selectedSegment?.start)} · End: {formatTime(selectedSegment?.end)}
                    </div>
                  </div>

                  <div className={`mt-4 rounded-xl border p-4 ${softCardClass}`}>
                    <p className="text-sm font-semibold">Bookmark</p>
                    <p className={`mt-2 text-xs ${subtextClass}`}>
                      {activeBookmark
                        ? `${formatTime(activeBookmark.time)} · ${getBookmarkSnippet(activeBookmark)}`
                        : 'No bookmark saved yet.'}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {activeProject.source === 'hpmor' && activeProject.timingMode === 'estimated' && (
                      <button
                        type="button"
                        onClick={() => seekToSegment(0)}
                        className={`w-full rounded-xl border px-4 py-3 font-semibold ${borderClass}`}
                      >
                        Jump to estimated chapter start
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveBookmark}
                      className={`w-full rounded-xl border px-4 py-3 font-semibold flex items-center justify-center gap-2 ${borderClass}`}
                    >
                      <Bookmark className="h-4 w-4" />
                      Save shared bookmark
                    </button>
                    <button
                      type="button"
                      onClick={handleJumpToBookmark}
                      disabled={!activeBookmark}
                      className={`w-full rounded-xl border px-4 py-3 font-semibold ${borderClass} disabled:opacity-60`}
                    >
                      Jump to bookmark
                    </button>
                    <button
                      type="button"
                      onClick={() => seekToSegment(selectedSegmentIndex)}
                      className="w-full rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900"
                    >
                      Jump to selected line
                    </button>

                    {activeProject.timingMode === 'estimated' && (
                      <>
                        <button
                          type="button"
                          onClick={handleSetAnchor}
                          className={`w-full rounded-xl border px-4 py-3 font-semibold flex items-center justify-center gap-2 ${borderClass}`}
                        >
                          <Pin className="h-4 w-4" />
                          Pin current time here
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAnchor}
                          className={`w-full rounded-xl border px-4 py-3 font-semibold ${borderClass}`}
                        >
                          Clear selected pin
                        </button>
                        <button
                          type="button"
                          onClick={handleResetEstimates}
                          className={`w-full rounded-xl border px-4 py-3 font-semibold flex items-center justify-center gap-2 ${borderClass}`}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Reset rough sync
                        </button>
                      </>
                    )}
                  </div>
                </section>

                <section className={`${cardClass} rounded-2xl shadow-2xl p-6`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xl font-bold">Reader text</h4>
                      <p className={`${subtextClass} mt-1 text-sm`}>
                        Continuous text view. Click any line to jump there; the active line stays highlighted,
                        and JSON transcripts with word timings also highlight the current word.
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${accentTextClass}`}>
                      {activeProject.timingMode === 'timed'
                        ? activeProjectHasWordTimings
                          ? 'word-level timings'
                          : 'line timings'
                        : `${countVisibleAnchors(activeProject)} manual pins`}
                    </span>
                  </div>

                  <div
                    ref={segmentsContainerRef}
                    className={`mt-4 max-h-[70vh] overflow-y-auto rounded-2xl border p-5 pr-3 ${softCardClass}`}
                  >
                    <div className="text-lg leading-8">
                    {activeProject.segments.map((segment) => {
                      const isSelected = selectedSegmentIndex === segment.index;
                      const isActive = activeSegmentIndex === segment.index;
                      const segmentWordIndex = isActive ? activeWordIndex : -1;
                      const hasManualAnchor =
                        Number.isFinite(activeProject.manualAnchors?.[segment.index]) &&
                        segment.index > 0 &&
                        segment.index < activeProject.segments.length;

                      return (
                        <button
                          key={segment.id}
                          type="button"
                          data-testid={`reader-line-${segment.index}`}
                          data-active={isActive ? 'true' : 'false'}
                          data-selected={isSelected ? 'true' : 'false'}
                          ref={(element) => {
                            segmentRefs.current[segment.index] = element;
                          }}
                          onClick={() => {
                            setSelectedSegmentIndex(segment.index);
                            if (Number.isFinite(segment.start)) {
                              seekToSegment(segment.index);
                            }
                          }}
                          className={`mb-1 mr-1 inline rounded-lg px-1.5 py-1 text-left align-baseline transition-all ${
                            isActive
                              ? 'bg-lime-200 text-gray-900 shadow-sm'
                              : isSelected
                                ? 'bg-yellow-100 text-gray-900'
                                : 'text-inherit hover:bg-yellow-50/80'
                          }`}
                        >
                          {renderSegmentWords(segment, segmentWordIndex)}
                          {hasManualAnchor && (
                            <span className="ml-1 rounded-full bg-yellow-200 px-2 py-0.5 text-[11px] font-semibold text-yellow-900">
                              pin
                            </span>
                          )}
                        </button>
                      );
                    })}
                    </div>
                  </div>
                </section>
              </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SyncReader;
