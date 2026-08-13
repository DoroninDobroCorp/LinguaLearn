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
  Play,
  Pause,
  FolderOpen,
  Globe,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  BookOpen,
  Volume2,
  VolumeX,
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

// Scroll sync helpers removed: bilingual reader now uses a single scroll
// container with paired rows, eliminating the need for cross-container sync.

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState(20);
  const [isImportDrawerOpen, setIsImportDrawerOpen] = useState(false);
  const [visibleTranslationIndex, setVisibleTranslationIndex] = useState(null);
  const segmentRefs = useRef({});
  const segmentsContainerRef = useRef(null);
  const splitEnglishSegmentRefs = useRef({});
  const splitBilingualContainerRef = useRef(null);
  const splitTranslationSegmentRefs = useRef({});
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
    if (!hasLoadedProjects) return;
    
    // Disable auto-bootstrap in Playwright E2E tests to prevent unmocked network requests
    // from timing out or blocking networkidle.
    const isAutomation = typeof window !== 'undefined' && (
      window.navigator.webdriver || 
      window.navigator.userAgent.toLowerCase().includes('playwright') ||
      window.navigator.userAgent.toLowerCase().includes('headless')
    );
    if (isAutomation) {
      return;
    }

    const missingChapters = [12, 13, 14, 15].filter(
      (ch) => !projects.some((p) => p.source === 'hpmor' && p.sourceChapterNumber === ch)
    );

    if (missingChapters.length > 0) {
      const runAutoImport = async () => {
        // Run in the background without setting isBusy or showing startBusyProgress (which lock interaction)
        for (const ch of missingChapters) {
          try {
            const data = await fetchReaderApiJson(`/api/reader/hpmor/chapter/${ch}`, {
              headers: { 'x-lingualearn-import-mode': 'timed' },
            });
            const now = new Date().toISOString();
            const project = buildTimedReaderProject({
              title: data.title,
              transcriptData: data,
              audioUrl: data.audioUrl,
              audioName: data.audioLabel,
              textName: `HPMOR chapter ${ch}`,
              now,
              extra: {
                source: data.source,
                sourceChapterNumber: ch,
                audioSourceType: data.audioSourceType,
                syncHint: data.syncHint,
              },
            });
            await persistProject(project, { select: false });
          } catch (e) {
            console.error(`Failed to auto-import chapter ${ch}:`, e);
          }
        }
        const saved = await getAllReaderProjects();
        setProjects(saved.map(normalizeLoadedProject));
      };
      runAutoImport();
    }
  }, [hasLoadedProjects, projects]);

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
      scrollTargets.push({
        container: splitBilingualContainerRef.current,
        element: splitEnglishSegmentRefs.current[activeSegmentIndex],
      });
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

  // Scroll sync effect removed: bilingual reader now uses a single scroll
  // container with paired rows, so both columns scroll as one.



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
    if (options.select !== false) {
      setActiveProjectId(savedProject.id);
    }
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
            detail: 'Upload complete. Processing on the server. Local Whisper is processing the audio.',
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
      detail: 'Processing on the server. The server is downloading the audio and running local Whisper. First run can take a couple of minutes.',
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

  // Parse chapter inputs like "4", "5,6", "10-12", "1, 2, 4-6"
  function parseChapterInput(inputString) {
    const chapters = new Set();
    const parts = String(inputString || '').split(/[\s,]+/);

    for (const part of parts) {
      if (!part.trim()) continue;

      if (part.includes('-')) {
        const rangeParts = part.split('-');
        if (rangeParts.length === 2) {
          const start = Number.parseInt(rangeParts[0], 10);
          const end = Number.parseInt(rangeParts[1], 10);
          if (Number.isInteger(start) && Number.isInteger(end) && start <= end) {
            for (let i = start; i <= end; i++) {
              if (i >= 1 && i <= 122 && i !== 64) {
                chapters.add(i);
              }
            }
          }
        }
      } else {
        const ch = Number.parseInt(part, 10);
        if (Number.isInteger(ch) && ch >= 1 && ch <= 122 && ch !== 64) {
          chapters.add(ch);
        }
      }
    }

    return Array.from(chapters).sort((a, b) => a - b);
  }

  async function handleImportHpmor(importMode = 'timed', options = {}) {
    setIsBusy(true);
    clearBusyProgress();

    try {
      let chapterNumbers = [];
      if (options.chapterNumber) {
        if (Array.isArray(options.chapterNumber)) {
          chapterNumbers = options.chapterNumber;
        } else {
          chapterNumbers = [Number.parseInt(options.chapterNumber, 10)];
        }
      } else {
        chapterNumbers = parseChapterInput(hpmorChapter);
      }

      if (chapterNumbers.length === 0) {
        throw new Error('Enter a valid HPMOR chapter number or range (e.g. 4, 5, 12-15). Note that Chapter 64 is not available.');
      }

      const importedProjects = [];
      const failedChapters = [];
      const total = chapterNumbers.length;

      for (let index = 0; index < total; index++) {
        const chapterNumber = chapterNumbers[index];
        const progressLabel = total > 1 ? ` (${index + 1} of ${total})` : '';

        if (importMode === 'timed') {
          startBusyProgress({
            label: `Transcribing chapter ${chapterNumber} locally${progressLabel}`,
            detail: 'The server is fetching the official audio and running local Whisper. First run can take a couple of minutes.',
            percent: Math.round((index / total) * 100),
          });
        } else {
          startBusyProgress({
            label: `Importing chapter ${chapterNumber} in rough sync${progressLabel}`,
            detail: 'The server is downloading the text and locating the audio source...',
            percent: Math.round((index / total) * 100),
          });
        }

        try {
          const data = await fetchReaderApiJson(`/api/reader/hpmor/chapter/${chapterNumber}`, {
            headers:
              importMode === 'timed'
                ? {
                    'x-lingualearn-import-mode': 'timed',
                  }
                : {},
          });

          const now = new Date().toISOString();
          const currentProjects = await getAllReaderProjects();
          const normalizedCurrentProjects = currentProjects.map((p) => normalizeLoadedProject(p));
          const matchingProjects = findMatchingHpmorProjects(
            options.currentProjects || normalizedCurrentProjects,
            chapterNumber,
          );
          const importedTimedSegments =
            data.timingMode === 'timed' && Array.isArray(data.segments) ? data.segments : [];

          let project;
          if (importedTimedSegments.length > 0) {
            project = buildTimedReaderProject({
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
          } else {
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
            project = {
              ...draftProject,
              segments: estimateSegmentBoundaries(
                rawSegments,
                data.audioDurationEstimate,
                buildCombinedAnchors(draftProject, data.audioDurationEstimate, rawSegments.length),
              ),
            };
          }

          await persistProject(project, {
            removeProjectIds: matchingProjects.map((matchingProject) => matchingProject.id),
          });
          importedProjects.push(project);
        } catch (chapterError) {
          console.error(`Error importing chapter ${chapterNumber}:`, chapterError);
          failedChapters.push({ chapter: chapterNumber, error: chapterError.message });
        }
      }

      // Refresh project list after batch finishes
      const savedProjects = await getAllReaderProjects();
      const normalizedProjects = savedProjects.map((project) => normalizeLoadedProject(project));
      setProjects(normalizedProjects);

      if (importedProjects.length > 0) {
        setActiveProjectId(importedProjects[0].id);
      }

      if (total === 1) {
        if (failedChapters.length > 0) {
          throw new Error(failedChapters[0].error);
        } else {
          const project = importedProjects[0];
          const isTimed = project.timingMode === 'timed';
          const suffix = isTimed ? '' : ' LinguaLearn will jump the audio near the estimated chapter start as soon as the metadata loads.';
          const initialMatching = findMatchingHpmorProjects(options.currentProjects || projects, chapterNumbers[0]);
          const prefix = initialMatching.length > 0 ? 'Replaced the existing Library item for this HPMOR chapter. ' : '';
          setStatus({
            type: 'success',
            message: `${prefix}${project.syncHint}${suffix}`,
          });
        }
      } else {
        if (failedChapters.length > 0) {
          setStatus({
            type: 'error',
            message: `Imported ${importedProjects.length} chapters, but failed on: ${failedChapters.map((fc) => `Chapter ${fc.chapter} (${fc.error})`).join(', ')}.`,
          });
        } else {
          setStatus({
            type: 'success',
            message: `Successfully imported ${importedProjects.length} chapter(s)!`,
          });
        }
      }

      return importedProjects.length > 0 ? importedProjects[0] : null;
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

  const togglePlayback = () => {
    if (!audioRef.current || !audioSource) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch((e) => setStatus({ type: 'error', message: e.message }));
    } else {
      audioRef.current.pause();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Top Header & Chapter Switcher */}
      <header className="sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl text-white shadow-md">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Sync Reader</h2>
              <p className="text-xs text-slate-500 mt-0.5">Premium Bilingual Audio Reading</p>
            </div>
          </div>

          {/* Chapter Quick Switcher */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50">
            <span className="text-xs font-semibold px-2.5 text-slate-400 dark:text-slate-500 uppercase tracking-wider">HPMOR Chapters:</span>
            {[12, 13, 14, 15].map((ch) => {
              const project = projects.find(p => p.source === 'hpmor' && p.sourceChapterNumber === ch);
              const isCurrent = activeProject?.source === 'hpmor' && activeProject?.sourceChapterNumber === ch;
              return (
                <button
                  key={ch}
                  type="button"
                  disabled={isBusy}
                  onClick={async () => {
                    if (project) {
                      handleSelectProject(project.id);
                    } else {
                      await handleImportHpmor('timed', { chapterNumber: ch });
                    }
                  }}
                  className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                    isCurrent
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  Ch {ch}
                </button>
              );
            })}
          </div>

          {/* Library Button */}
          <button
            onClick={() => setIsImportDrawerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-all border border-slate-200 dark:border-slate-700 shadow-sm"
          >
            <FolderOpen className="h-4 w-4 text-purple-500" />
            Library & Custom Imports
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-8 pb-36">
        {status.message && (
          <div
            className={`mb-6 rounded-2xl p-4 text-sm font-semibold flex items-center justify-between border ${
              status.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                : status.type === 'success'
                  ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                  : 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400'
            }`}
          >
            <span>{status.message}</span>
            <button onClick={() => setStatus({ type: 'idle', message: '' })} className="hover:opacity-75">✕</button>
          </div>
        )}
        {isBusy && busyProgress && (
          <div
            data-testid="reader-progress"
            className="mb-6 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg animate-pulse"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{busyProgress.label}</p>
              {Number.isFinite(busyProgress.percent) && (
                <span className="text-xs font-bold text-purple-600">{Math.round(busyProgress.percent)}%</span>
              )}
            </div>
            {busyProgress.detail && <p className="text-xs text-slate-400 mb-3">{busyProgress.detail}</p>}
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-300"
                style={{ width: `${Number.isFinite(busyProgress.percent) ? Math.max(busyProgress.percent, 6) : 42}%` }}
              ></div>
            </div>
          </div>
        )}

        {!activeProject ? (
          <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn">
            {/* Welcome Hero */}
            <div className="text-center py-6">
              <div className="inline-flex p-4 bg-purple-500/10 rounded-full text-purple-650 mb-4 animate-bounce">
                <BookOpen className="h-10 w-10" />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">English Sync Reader</h2>
              <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto font-sans">
                Improve your listening comprehension and shadowing with synchronized text and audio.
              </p>
            </div>

            {/* Ready examples */}
            <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-sans">Ready Study Examples</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleOpenReadyReaderExample('hpmor-chapter-4')}
                  disabled={isBusy}
                  aria-label="Open ready chapter 4"
                  className="p-4 bg-slate-50 dark:bg-slate-850 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 border border-slate-200 dark:border-slate-800 hover:border-purple-300 rounded-2xl text-left transition-all group font-sans"
                >
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-purple-600 dark:group-hover:text-purple-400">Chapter 4 Example</h4>
                  <p className="text-xs text-slate-500 mt-1">Timings and per-word highlighting</p>
                  <span className="inline-block mt-3 text-xs font-semibold text-purple-600 hover:underline">Open ready chapter 4</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenReadyReaderExample('hpmor-chapter-12')}
                  disabled={isBusy}
                  aria-label="Open ready chapter 12"
                  className="p-4 bg-slate-50 dark:bg-slate-850 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 border border-slate-200 dark:border-slate-800 hover:border-purple-300 rounded-2xl text-left transition-all group font-sans"
                >
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-purple-600 dark:group-hover:text-purple-400">Chapter 12 Example</h4>
                  <p className="text-xs text-slate-500 mt-1">Whisper lines and Russian side translation</p>
                  <span className="inline-block mt-3 text-xs font-semibold text-purple-600 hover:underline">Open ready chapter 12</span>
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className="animate-fadeIn">
            {/* Project Header */}
            <div className="mb-8 pb-6 border-b border-slate-200/60 dark:border-slate-800/60 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">Active Chapter</span>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1 leading-tight font-sans">
                  {activeProject.title}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-sans">
                  {activeProject.timingMode === 'timed'
                    ? activeProjectHasWordTimings
                      ? 'Exact timings are loaded with word-level highlighting.'
                      : 'Exact line timings are loaded. Add word-aware JSON if you want current-word highlighting too.'
                    : activeProject.syncHint ||
                      'Rough sync is estimated from text length. Use manual anchors where it drifts.'}
                </p>
                <p className="text-xs text-slate-400 mt-2 flex flex-wrap items-center gap-2 font-sans">
                  <span>Source: {activeProject.textName}</span>
                  <span>•</span>
                  <span>Audio: {activeProject.audioName}</span>
                  <span>•</span>
                  <span>
                    {activeProject.timingMode === 'timed'
                      ? activeProjectHasWordTimings
                        ? 'word-level timings'
                        : 'line timings'
                      : `${countVisibleAnchors(activeProject)} manual pins`}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-sans">
                {/* Translate Chapter Button */}
                {!activeProjectHasTranslations && (
                  <button
                    onClick={() => handleLoadProjectTranslations()}
                    disabled={isTranslationBusy}
                    className="px-3.5 py-2 border border-purple-500/30 hover:border-purple-500 bg-purple-50/5 text-purple-600 dark:text-purple-400 rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {isTranslationBusy ? 'Translating...' : 'Translate Chapter (AI)'}
                  </button>
                )}

                {/* Save Bookmark */}
                <button
                  type="button"
                  onClick={handleSaveBookmark}
                  className="px-3.5 py-2 border border-slate-200 dark:border-slate-800 text-slate-655 dark:text-slate-350 hover:text-purple-600 dark:hover:text-purple-400 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  Save shared bookmark
                </button>

                {/* Jump to Bookmark */}
                <button
                  type="button"
                  onClick={handleJumpToBookmark}
                  disabled={!activeBookmark}
                  className="px-3.5 py-2 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  Jump to bookmark
                </button>

                {/* Export Timings Button */}
                <button
                  type="button"
                  onClick={handleExportProject}
                  className="p-2 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl transition-all"
                  title="Export timings JSON"
                >
                  <Download className="h-4 w-4" />
                </button>

                {/* Delete Project Button */}
                <button
                  type="button"
                  onClick={() => handleDeleteProject(activeProject.id)}
                  className="p-2 border border-red-200 dark:border-red-950/40 text-red-500 hover:text-white hover:bg-red-500 dark:hover:bg-red-650 rounded-xl transition-all"
                  title="Delete project"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Saved Progress Card */}
            {activeReadingProgress && (
              <div className="mb-6 p-4 rounded-2xl border border-purple-100 dark:border-purple-900 bg-purple-50/30 dark:bg-purple-950/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 font-sans">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Saved progress found</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    LinguaLearn remembers where you stopped in this chapter.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-purple-650 dark:text-purple-400">
                    Continue from {formatTime(activeReadingProgress.time)}
                  </p>
                  <button
                    type="button"
                    onClick={handleResumeSavedProgress}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-650 hover:to-indigo-750 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                  >
                    Continue where I stopped
                  </button>
                </div>
              </div>
            )}

            {/* Shared Bookmark Block */}
            <div className="mb-6 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans text-sm">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">Shared bookmark</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeBookmark ? getBookmarkSnippet(activeBookmark) : 'Save the current spot whenever you want to come back later.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span data-testid="shared-bookmark-time" className="text-xs font-bold px-2.5 py-1 bg-purple-100/50 dark:bg-purple-950/30 text-purple-650 dark:text-purple-400 rounded-lg">
                  {activeBookmark ? formatTime(activeBookmark.time) : 'No bookmark yet'}
                </span>
              </div>
            </div>

            {/* Reader text Section Label */}
            <div className="mb-3 font-sans">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans">Reader text</h3>
            </div>

            {/* Reading Viewport */}
            <div
              ref={(el) => {
                segmentsContainerRef.current = el;
                splitBilingualContainerRef.current = el;
              }}
              data-testid={isBilingualMode ? 'split-bilingual-scroll' : undefined}
              className="pr-4 space-y-6 pb-32"
              style={{ height: '400px', maxHeight: '62vh', overflowY: 'auto', display: 'block' }}
            >
              {activeProject.segments.map((segment, index) => {
                const isActive = index === activeSegmentIndex;
                const isSelected = index === selectedSegmentIndex;
                const segmentWordIndex = isActive ? activeWordIndex : -1;

                const showTranslation = isBilingualMode || visibleTranslationIndex === index;
                const translatedText = activeProjectTranslations ? activeProjectTranslations[index] : null;

                return (
                  <div
                    key={segment.id}
                    ref={(el) => {
                      segmentRefs.current[index] = el;
                      splitEnglishSegmentRefs.current[index] = el;
                    }}
                    data-testid={`reader-line-${index}`}
                    data-active={isActive ? 'true' : undefined}
                    data-selected={isSelected ? 'true' : undefined}
                    onClick={() => {
                      if (Number.isFinite(segment.start)) {
                        seekToSegment(index);
                      } else {
                        setSelectedSegmentIndex(index);
                      }
                      setVisibleTranslationIndex(visibleTranslationIndex === index ? null : index);
                    }}
                    className={`group transition-all duration-300 py-3 px-4 rounded-2xl cursor-pointer border ${
                      isActive
                        ? 'bg-purple-500/5 dark:bg-purple-400/5 border-purple-200 dark:border-purple-800/80 opacity-100 shadow-sm'
                        : isSelected
                          ? 'bg-slate-100/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-90'
                          : 'border-transparent opacity-50 hover:opacity-85'
                    }`}
                  >
                    <p
                      className="font-serif leading-relaxed text-slate-800 dark:text-slate-100"
                      style={{ fontSize: `${readerFontSize}px` }}
                    >
                      {renderSegmentWords(segment, segmentWordIndex)}
                    </p>
                    {showTranslation && translatedText && (
                      <p className="mt-2 text-sm text-slate-505 dark:text-slate-400 italic pl-4 border-l-2 border-purple-400/50 font-sans font-sans">
                        {translatedText}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Hidden native audio tag to drive the custom player */}
            <audio
              key={activeProject.id}
              data-project-id={activeProject.id}
              ref={audioRef}
              preload="metadata"
              src={audioSource}
              onLoadedMetadata={handleAudioMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={(e) => {
                setIsPlaying(false);
                handleAudioPause(e);
              }}
              onTimeUpdate={handleTimeUpdate}
              className="hidden"
            />

            {/* Floating Glassmorphic Audio Player */}
            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-3xl px-4 z-40">
              <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border border-slate-200/50 dark:border-slate-800/50 shadow-2xl rounded-2xl p-4 flex flex-col gap-3 transition-all duration-300">
                {/* Timeline row */}
                <div className="flex items-center gap-3 w-full">
                  <span className="text-xs font-semibold text-slate-500 w-10 text-right select-none font-sans">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={
                      audioRef.current?.duration
                        ? (currentTime / audioRef.current.duration) * 100
                        : 0
                    }
                    onChange={(e) => {
                      const pct = Number(e.target.value);
                      if (audioRef.current && audioRef.current.duration) {
                        const newTime = (pct / 100) * audioRef.current.duration;
                        audioRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                      }
                    }}
                    className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-200 dark:bg-slate-800 accent-purple-600 focus:outline-none"
                  />
                  <span className="text-xs font-semibold text-slate-500 w-10 select-none font-sans">
                    {formatTime(audioRef.current?.duration || activeProject.audioDuration || 0)}
                  </span>
                </div>

                {/* Control row */}
                <div className="flex items-center justify-between gap-4">
                  {/* Left: Font Size & Speed */}
                  <div className="flex items-center gap-2 font-sans">
                    {/* Font Adjuster */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800/50 rounded-xl px-2 border border-slate-200/50 dark:border-slate-800/50">
                      <button
                        type="button"
                        onClick={() => setReaderFontSize((size) => Math.max(14, size - 1))}
                        className="p-1.5 text-xs font-bold text-slate-500 hover:text-purple-600 dark:hover:text-purple-400"
                        title="Decrease text size"
                      >
                        A-
                      </button>
                      <span className="text-xs font-semibold text-slate-400 px-1 select-none">
                        {readerFontSize}px
                      </span>
                      <button
                        type="button"
                        onClick={() => setReaderFontSize((size) => Math.min(32, size + 1))}
                        className="p-1.5 text-xs font-bold text-slate-500 hover:text-purple-600 dark:hover:text-purple-400"
                        title="Increase text size"
                      >
                        A+
                      </button>
                    </div>

                    {/* Speed Selector */}
                    <select
                      value={playbackRate}
                      onChange={(e) => setPlaybackRate(Number(e.target.value))}
                      className="bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-350 border border-slate-200/50 dark:border-slate-800/50 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none cursor-pointer"
                      title="Playback Speed"
                    >
                      {[0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((speed) => (
                        <option key={speed} value={speed}>
                          {speed}x
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Center: Play/Pause/Rewind */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleJump(-5)}
                      className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                      title="Rewind 5s"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={togglePlayback}
                      className="p-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-full hover:scale-105 active:scale-95 transition-all shadow-md"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5 fill-current" />
                      ) : (
                        <Play className="h-5 w-5 fill-current ml-0.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleJump(5)}
                      className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                      title="Forward 5s"
                    >
                      <RotateCcw className="h-4 w-4 transform -scale-x-100" />
                    </button>
                  </div>

                  {/* Right: Bilingual & Auto-scroll Options */}
                  <div className="flex items-center gap-2 font-sans">
                    <button
                      type="button"
                      onClick={() => setIsBilingualMode(!isBilingualMode)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                        isBilingualMode
                          ? 'bg-purple-500/10 border-purple-500/30 text-purple-650 dark:text-purple-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-655 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="Show translations for all lines"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {isBilingualMode ? 'Close EN/RU reader' : 'Open EN/RU reader'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setFollowPlayback(!followPlayback)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                        followPlayback
                          ? 'bg-purple-500/10 border-purple-500/30 text-purple-650 dark:text-purple-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-655 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="Auto-scroll to active sentence"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5 rotate-90" />
                      Follow playback: {followPlayback ? 'on' : 'off'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Library Shelf & Import Forms (always visible at the bottom of the page) */}
        <div id="library-section" className="max-w-3xl mx-auto space-y-8 mt-16 pt-12 border-t border-slate-200/60 dark:border-slate-800/60 pb-16">
          {/* Library / Your Projects */}
          <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-sans">Your Library</h3>
              {hpmorProjectCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetHpmorProjects}
                  className="text-xs text-red-500 hover:underline font-semibold font-sans"
                >
                  Reset HPMOR chapters ({hpmorProjectCount})
                </button>
              )}
            </div>

            {projects.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-sm text-slate-400 italic font-sans">
                No reader projects yet. Import a chapter below to get started!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {projects.map((project) => {
                  const isActive = project.id === activeProjectId;
                  const badges = getSegmentBadges(project);
                  const progress = normalizeReaderProgress(project.readingProgress);
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => handleSelectProject(project.id)}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        isActive
                          ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-305 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-900/30'
                      }`}
                    >
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate font-sans">{project.title}</div>
                      <p className="text-xs text-slate-400 mt-1 font-sans">
                        {badges.modeLabel} · {badges.segmentCount} segments
                      </p>
                      {progress && (
                        <p className="text-xs font-semibold text-purple-650 dark:text-purple-400 mt-2 font-sans">
                          Resume from {formatTime(progress.time)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Quick HPMOR Import */}
          <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-sans">
              Quick HPMOR Chapter Import
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex-1 block text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer font-sans">
                HPMOR Chapter Number (e.g. 4, 12-15)
                <input
                  type="text"
                  placeholder="Chapter(s) to import, e.g. 12"
                  value={hpmorChapter}
                  onChange={(e) => setHpmorChapter(e.target.value)}
                  className="w-full mt-1.5 px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 dark:text-slate-200 placeholder-slate-400 font-normal font-sans"
                />
              </label>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => handleImportHpmor('timed')}
                  disabled={isBusy}
                  className="h-10 px-4 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-650 hover:to-indigo-750 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center font-sans"
                >
                  Import chapter
                </button>
              </div>
            </div>
          </section>

          {/* Custom Import Form */}
          <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-sans">
              Import Custom Text & Audio
            </h3>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer font-sans">
                Project title
                <input
                  type="text"
                  placeholder="e.g. My Favorite Podcast"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full mt-1.5 px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 dark:text-slate-200 placeholder-slate-400 font-normal font-sans"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer font-sans">
                Chapter Text
                <textarea
                  placeholder="Paste chapter text here, or upload a .txt/.md file below."
                  value={form.text}
                  onChange={(e) => setForm({ ...form, text: e.target.value })}
                  rows={4}
                  className="w-full mt-1.5 px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 dark:text-slate-200 placeholder-slate-400 resize-none font-sans font-normal"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer font-sans">
                  Audio URL
                  <input
                    type="text"
                    placeholder="https://example.com/audio.mp3"
                    value={form.audioUrl}
                    onChange={(e) => setForm({ ...form, audioUrl: e.target.value })}
                    className="w-full mt-1.5 px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 dark:text-slate-200 placeholder-slate-400 font-normal font-sans"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer font-sans">
                  Upload Audio File
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setForm({ ...form, audioFile: e.target.files[0] })}
                    className="w-full mt-1.5 text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-50 dark:file:bg-purple-950/30 file:text-purple-700 dark:file:text-purple-400 hover:file:bg-purple-100 transition-all cursor-pointer font-normal font-sans"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer font-sans">
                  Optional timings (JSON, SRT, VTT)
                  <input
                    type="file"
                    accept=".json,.srt,.vtt"
                    onChange={(e) => setForm({ ...form, timingsFile: e.target.files[0] })}
                    className="w-full mt-1.5 text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-50 dark:file:bg-purple-950/30 file:text-purple-700 dark:file:text-purple-400 hover:file:bg-purple-100 transition-all cursor-pointer font-normal font-sans"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer font-sans">
                  Optional chapter text file (.txt, .md)
                  <input
                    type="file"
                    accept=".txt,.md"
                    onChange={(e) => setForm({ ...form, textFile: e.target.files[0] })}
                    className="w-full mt-1.5 text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-50 dark:file:bg-purple-950/30 file:text-purple-700 dark:file:text-purple-400 hover:file:bg-purple-100 transition-all cursor-pointer font-normal font-sans"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer font-sans">
                Segmentation mode
                <select
                  value={form.segmentationMode}
                  onChange={(e) => setForm({ ...form, segmentationMode: e.target.value })}
                  className="w-full mt-1.5 px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 dark:text-slate-200 cursor-pointer font-normal font-sans"
                >
                  <option value="paragraph">Paragraphs</option>
                  <option value="sentence">Sentences</option>
                </select>
              </label>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isBusy}
                  className="flex-1 py-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 font-sans"
                >
                  Create Reader Project
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleCreateTimedTranscriptProject}
                  className="flex-1 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-650 hover:to-indigo-770 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50 font-sans"
                >
                  Transcribe Audio Locally
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>

      {/* Library Drawer overlay */}
      {isImportDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden font-sans">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsImportDrawerOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md transform transition-all bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-purple-500" />
                  Library & Custom Imports
                </h2>
                <button
                  type="button"
                  onClick={() => setIsImportDrawerOpen(false)}
                  className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-200 transition-colors p-1"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Drawer Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                {/* Library Projects List */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Your Projects
                    </h3>
                    {hpmorProjectCount > 0 && (
                      <button
                        type="button"
                        onClick={handleResetHpmorProjects}
                        className="text-xs text-red-500 hover:text-red-605 hover:underline font-semibold"
                      >
                        Reset HPMOR ({hpmorProjectCount})
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {projects.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No custom projects yet.</p>
                    ) : (
                      projects.map((project) => {
                        const isActive = project.id === activeProjectId;
                        const badges = getSegmentBadges(project);
                        const progress = normalizeReaderProgress(project.readingProgress);
                        return (
                          <div
                            key={project.id}
                            className={`p-4 rounded-2xl border transition-all ${
                              isActive
                                ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20'
                                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectProject(project.id);
                                  setIsImportDrawerOpen(false);
                                }}
                                className="flex-1 text-left"
                              >
                                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                                  {project.title}
                                </h4>
                                <p className="text-xs text-slate-400 mt-1">
                                  {badges.modeLabel} · {badges.segmentCount} segments
                                </p>
                                {progress && (
                                  <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mt-2">
                                    Progress: {formatTime(progress.time)}
                                  </p>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteProject(project.id)}
                                className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-855"
                                title="Delete project"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Import Custom File/Text form */}
                <div className="space-y-4 border-t border-slate-200/60 dark:border-slate-800 pt-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Import Custom Text & Audio
                  </h3>

                  <form onSubmit={handleCreateProject} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Project Title
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. My Favorite Podcast"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 dark:text-slate-200 placeholder-slate-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Pasted Text
                      </label>
                      <textarea
                        placeholder="Paste the chapter text to read..."
                        value={form.text}
                        onChange={(e) => setForm({ ...form, text: e.target.value })}
                        rows={4}
                        className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 dark:text-slate-200 placeholder-slate-400 resize-none font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Audio URL (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="https://example.com/audio.mp3"
                        value={form.audioUrl}
                        onChange={(e) => setForm({ ...form, audioUrl: e.target.value })}
                        className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 dark:text-slate-200 placeholder-slate-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Upload Audio File (Optional)
                      </label>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => setForm({ ...form, audioFile: e.target.files[0] })}
                        className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-50 dark:file:bg-purple-950/30 file:text-purple-700 dark:file:text-purple-400 hover:file:bg-purple-100 transition-all cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Segmentation Mode
                      </label>
                      <select
                        value={form.segmentationMode}
                        onChange={(e) => setForm({ ...form, segmentationMode: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 dark:text-slate-200 cursor-pointer"
                      >
                        <option value="paragraph">Paragraphs</option>
                        <option value="sentence">Sentences</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={isBusy}
                        className="w-full py-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                      >
                        Import Text + Audio (Rough Sync)
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={handleCreateTimedTranscriptProject}
                        className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50"
                      >
                        Transcribe & Import (Local Whisper ASR)
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SyncReader;
