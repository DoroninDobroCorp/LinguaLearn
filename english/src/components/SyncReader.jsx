import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Clock3,
  Download,
  FileAudio,
  FileText,
  Headphones,
  Link2,
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
const HPMOR_RESET_VERSION = '2026-03-17-reset';

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
    modeLabel: project.timingMode === 'timed' ? 'Timed transcript' : 'Rough sync + anchors',
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
  const [hpmorChapter, setHpmorChapter] = useState('1');
  const [followPlayback, setFollowPlayback] = useState(false);
  const segmentRefs = useRef({});
  const segmentsContainerRef = useRef(null);
  const audioRef = useRef(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId],
  );

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
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setStatus({ type: 'error', message: error.message });
      }
    }

    loadProjects();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeProject) {
      setSelectedSegmentIndex(0);
      setActiveSegmentIndex(-1);
      setCurrentTime(0);
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

    const container = segmentsContainerRef.current;
    const element = segmentRefs.current[activeSegmentIndex];
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
  }, [activeSegmentIndex, followPlayback]);

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

  async function persistProject(updatedProject, options = {}) {
    const idsToRemove = new Set((options.removeProjectIds || []).filter(Boolean));
    const savedProject = {
      ...updatedProject,
      updatedAt: new Date().toISOString(),
    };

    const duplicateIds = [...idsToRemove].filter((projectId) => projectId !== savedProject.id);
    if (duplicateIds.length > 0) {
      await deleteReaderProjects(duplicateIds);
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

  async function handleImportHpmor() {
    setIsBusy(true);

    try {
      const chapterNumber = Number.parseInt(hpmorChapter, 10);
      if (!Number.isInteger(chapterNumber)) {
        throw new Error('Enter a valid HPMOR chapter number.');
      }

      const response = await fetch(`/english/api/reader/hpmor/chapter/${chapterNumber}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import HPMOR chapter.');
      }

      const rawSegments = splitTextIntoSegments(data.text, 'sentence');
      const now = new Date().toISOString();
      const matchingProjects = findMatchingHpmorProjects(projects, chapterNumber);
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
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAudioMetadata() {
    if (!activeProject || activeProject.timingMode !== 'estimated' || !audioRef.current) {
      return;
    }

    const duration = audioRef.current.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
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

  function handleTimeUpdate() {
    if (!activeProject || !audioRef.current) {
      return;
    }

    const nextTime = audioRef.current.currentTime;
    setCurrentTime(nextTime);
    const nextIndex = findSegmentIndexByTime(activeProject.segments, nextTime);
    setActiveSegmentIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex));
  }

  function seekToSegment(segmentIndex) {
    if (!audioRef.current || !activeProject) {
      return;
    }

    const segment = activeProject.segments[segmentIndex];
    if (!segment || !Number.isFinite(segment.start)) {
      return;
    }

    audioRef.current.currentTime = segment.start;
    setSelectedSegmentIndex(segmentIndex);
    setCurrentTime(segment.start);
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

    audioRef.current.currentTime = bookmarkTime;
    setSelectedSegmentIndex(bookmarkSegmentIndex);
    setActiveSegmentIndex(bookmarkSegmentIndex);
    setCurrentTime(bookmarkTime);
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
    audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  const selectedSegment = activeProject?.segments[selectedSegmentIndex] || null;
  const activeSegment = activeProject?.segments[activeSegmentIndex] || null;
  const activeBookmark = activeProject?.bookmark || null;
  const activeWordIndex = activeSegment ? findActiveWordIndex(activeSegment.words, currentTime) : -1;
  const activeProjectHasWordTimings = activeProject?.segments?.some(
    (segment) => Array.isArray(segment.words) && segment.words.length > 0,
  );
  const isPreparingChapterStart = Boolean(activeProject?.needsInitialSeek && audioSource);
  const hpmorProjectCount = getHpmorProjects(projects).length;

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
              JSON, SRT, or VTT.
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
                Imports the official chapter text and uses the narrowest official HPMOR podcast audio
                file available. If a chapter only exists as split sub-episodes, LinguaLearn falls back to
                the wider audiobook part.
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
                  onClick={handleImportHpmor}
                  disabled={isBusy}
                  className="rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900 whitespace-nowrap disabled:opacity-60"
                >
                  Import chapter
                </button>
              </div>
              <p className={`mt-2 text-xs ${subtextClass}`}>
                Note: chapter 64 does not have a matching audiobook part in the official podcast release.
              </p>
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
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className={`${cardClass} rounded-2xl shadow-2xl p-6`}>
            <h3 className="text-2xl font-bold flex items-center gap-2">
              <Plus className="h-6 w-6 text-yellow-500" />
              Create Reader Project
            </h3>
            <p className={`${subtextClass} mt-2 text-sm`}>
              Import a chapter, article, podcast transcript, or audiobook slice. Timings are optional.
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

              <button
                type="submit"
                disabled={isBusy}
                className="w-full rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 px-4 py-3 font-bold text-gray-900 shadow-md disabled:opacity-60"
              >
                {isBusy ? 'Creating project...' : 'Create Reader Project'}
              </button>
            </form>
          </section>

          <section className={`${cardClass} rounded-2xl shadow-2xl p-6`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-2xl font-bold">Library</h3>
                <p className={`${subtextClass} mt-2 text-sm`}>
                  Saved locally in your browser with text, timings, and uploaded audio files.
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
                    onClick={() => setActiveProjectId(project.id)}
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
                      </div>
                      {badges.manualAnchors > 0 && (
                        <span className="rounded-full bg-yellow-200 px-2 py-1 text-xs font-semibold text-yellow-900">
                          {badges.manualAnchors} pins
                        </span>
                      )}
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
                          ? 'Exact timings imported from a transcript file with word-level highlighting.'
                          : 'Exact line timings imported from a transcript file. Add word-aware JSON if you want current-word highlighting too.'
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
              </section>

              <section className={`${cardClass} rounded-2xl shadow-2xl p-6`}>
                {isPreparingChapterStart && (
                  <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">
                    Preparing the estimated start of this chapter. Play controls will unlock in a moment so
                    you do not hear the wrong chapter first.
                  </div>
                )}
                <audio
                  key={activeProject.id}
                  ref={audioRef}
                  controls={!isPreparingChapterStart}
                  preload="metadata"
                  src={audioSource}
                  onLoadedMetadata={handleAudioMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full"
                />

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
              </section>

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
                      {countVisibleAnchors(activeProject)} manual pins
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SyncReader;
