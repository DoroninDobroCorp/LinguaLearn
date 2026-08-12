import React, { useState, useEffect, useMemo } from 'react';
import {
  Inbox,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  Undo2,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
  MessageSquare,
  Clock,
  ArrowRight,
  Tag,
  Laptop,
  HelpCircle,
  AlertTriangle
} from 'lucide-react';

function CorrectionInbox() {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedTopic, setSelectedTopic] = useState('ALL');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Feedback action loading/tracking
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchSamples();
  }, []);

  const fetchSamples = async () => {
    setLoading(true);
    setError(null);
    try {
      // Try /english/api/writing/samples then fallback to /api/writing/samples
      let res = await fetch('/english/api/writing/samples?limit=100');
      if (!res.ok && res.status === 404) {
        res = await fetch('/api/writing/samples?limit=100');
      }
      
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Пожалуйста, авторизуйтесь для доступа к архиву исправление ошибок.');
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Ошибка сервера (${res.status})`);
      }

      const data = await res.json();
      setSamples(data.samples || []);
    } catch (err) {
      console.error('Error fetching writing samples:', err);
      setError(err.message || 'Не удалось загрузить образцы писем.');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const handleFeedback = async (sampleId, feedbackType, notes = '') => {
    setActionLoading((prev) => ({ ...prev, [`${sampleId}-${feedbackType}`]: true }));
    try {
      let res = await fetch(`/english/api/writing/samples/${sampleId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback_type: feedbackType, notes }),
      });

      if (!res.ok && res.status === 404) {
        res = await fetch(`/api/writing/samples/${sampleId}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback_type: feedbackType, notes }),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось отправить отзыв.');
      }

      const result = await res.json();

      // Update sample local state with new feedback record
      setSamples((prevSamples) =>
        prevSamples.map((sample) => {
          if (sample.id === sampleId) {
            const existingFeedback = sample.feedback || [];
            const newFbItem = result.feedback
              ? {
                  id: result.feedback.id,
                  feedbackType: result.feedback.feedback_type,
                  notes: result.feedback.notes,
                  undoneEvidenceCount: result.feedback.undone_evidence_count,
                  createdAt: result.feedback.created_at,
                }
              : {
                  feedbackType: feedbackType,
                  notes,
                  undoneEvidenceCount: result.undoneEvidenceCount || 0,
                  createdAt: new Date().toISOString(),
                };

            // Replace or append feedback type
            const filteredFb = existingFeedback.filter((f) => f.feedbackType !== feedbackType);
            return {
              ...sample,
              feedback: [...filteredFb, newFbItem],
            };
          }
          return sample;
        })
      );

      if (feedbackType === 'helpful') {
        showToast('Спасибо! Отзыв "Полезно" сохранен.');
      } else if (feedbackType === 'undo_progress') {
        showToast('Влияние на статистику прогресса успешно отменено!');
      } else {
        showToast('Ваш отзыв успешно записан.');
      }
    } catch (err) {
      console.error('Feedback error:', err);
      showToast(err.message || 'Ошибка при отправке отзыва', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${sampleId}-${feedbackType}`]: false }));
    }
  };

  // Derive unique source apps and topics for filters
  const { availableApps, availableTopics } = useMemo(() => {
    const apps = new Set();
    const topics = new Set();

    samples.forEach((s) => {
      if (s.sourceApp) apps.add(s.sourceApp);
      if (s.analysis && Array.isArray(s.analysis.errors)) {
        s.analysis.errors.forEach((err) => {
          if (err.topic) topics.add(err.topic);
        });
      }
    });

    return {
      availableApps: Array.from(apps).sort(),
      availableTopics: Array.from(topics).sort(),
    };
  }, [samples]);

  // Filtered samples
  const filteredSamples = useMemo(() => {
    return samples.filter((sample) => {
      const originalText = sample.originalText || '';
      const correctedText = sample.analysis?.correctedText || '';
      const summaryRu = sample.analysis?.summaryRu || '';
      const errors = sample.analysis?.errors || [];

      // Keyword search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesOriginal = originalText.toLowerCase().includes(query);
        const matchesCorrected = correctedText.toLowerCase().includes(query);
        const matchesSummary = summaryRu.toLowerCase().includes(query);
        const matchesError = errors.some(
          (e) =>
            (e.original && e.original.toLowerCase().includes(query)) ||
            (e.correction && e.correction.toLowerCase().includes(query)) ||
            (e.explanationRu && e.explanationRu.toLowerCase().includes(query)) ||
            (e.topic && e.topic.toLowerCase().includes(query))
        );

        if (!matchesOriginal && !matchesCorrected && !matchesSummary && !matchesError) {
          return false;
        }
      }

      // App filter
      if (selectedApp !== 'ALL' && sample.sourceApp !== selectedApp) {
        return false;
      }

      // Status filter (CHANGED vs NO_ERRORS)
      const hasErrors = (sample.analysis?.changed ?? false) || errors.length > 0;
      if (selectedStatus === 'CHANGED' && !hasErrors) {
        return false;
      }
      if (selectedStatus === 'NO_ERRORS' && hasErrors) {
        return false;
      }

      // Topic filter
      if (selectedTopic !== 'ALL') {
        const hasTopic = errors.some((e) => e.topic === selectedTopic);
        if (!hasTopic) return false;
      }

      return true;
    });
  }, [samples, searchQuery, selectedApp, selectedStatus, selectedTopic]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedApp, selectedStatus, selectedTopic]);

  // Paginated subset
  const totalPages = Math.max(1, Math.ceil(filteredSamples.length / pageSize));
  const paginatedSamples = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSamples.slice(start, start + pageSize);
  }, [filteredSamples, currentPage, pageSize]);

  const hasActiveFilters = searchQuery.trim() !== '' || selectedApp !== 'ALL' || selectedStatus !== 'ALL' || selectedTopic !== 'ALL';

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedApp('ALL');
    setSelectedStatus('ALL');
    setSelectedTopic('ALL');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return dateString;
    }
  };

  // Helper to render diff between original and corrected text
  const renderDiffViewer = (sample) => {
    const original = sample.originalText;
    const corrected = sample.analysis?.correctedText || '';
    const errors = sample.analysis?.errors || [];
    const isPurged = sample.retentionPurged || original === null || original === undefined;

    if (isPurged) {
      return (
        <div className="space-y-2">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Исходный текст удален в соответствии с вашими настройками хранения данных (retention policy).</span>
          </div>
          {corrected && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <span className="text-xs font-semibold text-green-700 dark:text-green-400 block mb-1">Исправленный вариант:</span>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{corrected}</p>
            </div>
          )}
        </div>
      );
    }

    if (!sample.analysis?.changed && errors.length === 0) {
      return (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1 text-xs font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            <span>Отлично! Текст написан без грамматических ошибок.</span>
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">{original}</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Original Text Box */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Оригинал (Захвачено)
              </span>
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-200 font-normal leading-relaxed whitespace-pre-wrap">
              {original}
            </p>
          </div>
        </div>

        {/* Corrected Text Box */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Исправленный вариант
              </span>
            </div>
            <p className="text-sm text-gray-900 dark:text-gray-100 font-medium leading-relaxed whitespace-pre-wrap">
              {corrected}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 animate-slide-up ${
            toast.type === 'error'
              ? 'bg-red-900/90 text-red-100 border-red-700'
              : 'bg-emerald-900/90 text-emerald-100 border-emerald-700'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle className="h-5 w-5 text-red-400" /> : <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-gradient-to-br from-yellow-400 to-lime-500 rounded-xl text-gray-900 shadow-md">
              <Inbox className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-extrabold text-gradient">Correction Inbox</h1>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Персональный архив разбора ошибок, визуальное сравнение и обратная связь для алгоритма.
          </p>
        </div>

        <button
          onClick={fetchSamples}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-all shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-50 self-start md:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Обновить</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass p-5 rounded-2xl shadow-lg space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Keyword Search */}
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              data-testid="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по тексту, объяснению или теме..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Source App Filter */}
          <div className="md:col-span-3">
            <select
              data-testid="app-filter"
              value={selectedApp}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-yellow-400 outline-none transition"
            >
              <option value="ALL">Все приложения ({availableApps.length})</option>
              {availableApps.map((app) => (
                <option key={app} value={app}>
                  {app}
                </option>
              ))}
            </select>
          </div>

          {/* Changed / Status Filter */}
          <div className="md:col-span-2">
            <select
              data-testid="status-filter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-yellow-400 outline-none transition"
            >
              <option value="ALL">Все статусы</option>
              <option value="CHANGED">С ошибками</option>
              <option value="NO_ERRORS">Без ошибок</option>
            </select>
          </div>

          {/* Topic Filter */}
          <div className="md:col-span-3">
            <select
              data-testid="topic-filter"
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-yellow-400 outline-none transition"
            >
              <option value="ALL">Все грамматические темы</option>
              {availableTopics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filters Summary & Reset */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
            <span>
              Найдено записей: <strong>{filteredSamples.length}</strong> из {samples.length}
            </span>
            <button
              onClick={resetFilters}
              className="text-yellow-600 dark:text-yellow-400 hover:underline font-semibold flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" /> Сбросить фильтры
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass p-6 rounded-2xl space-y-4 skeleton">
              <div className="h-5 bg-gray-300 dark:bg-gray-700 rounded w-1/4"></div>
              <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
              <div className="h-10 bg-gray-300 dark:bg-gray-700 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="glass p-8 rounded-2xl text-center space-y-4 border-red-500/30">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Не удалось загрузить данные</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">{error}</p>
          <button
            onClick={fetchSamples}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold shadow-md hover:scale-105 transition"
          >
            Попробовать снова
          </button>
        </div>
      ) : filteredSamples.length === 0 ? (
        <div className="glass p-12 rounded-2xl text-center space-y-4">
          <Inbox className="h-14 w-14 text-gray-400 mx-auto animate-pulse" />
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
            {hasActiveFilters ? 'По вашему запросу ничего не найдено' : 'Архив записей пока пуст'}
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            {hasActiveFilters
              ? 'Попробуйте изменить параметры поиска или сбросить фильтры.'
              : 'Когда вы пишете на английском через Mac Capture Agent, проанализированные тексты появятся здесь.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="px-4 py-2 rounded-xl bg-yellow-400 text-gray-900 font-semibold text-sm shadow hover:bg-yellow-300 transition"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Sample Cards List */}
          <div className="space-y-6">
            {paginatedSamples.map((sample) => {
              const errors = sample.analysis?.errors || [];
              const summaryRu = sample.analysis?.summaryRu;
              const feedbackList = sample.feedback || [];
              const isHelpfulSubmitted = feedbackList.some((f) => f.feedbackType === 'helpful');
              const isUndoSubmitted = feedbackList.some((f) => f.feedbackType === 'undo_progress');

              return (
                <div
                  key={sample.id || sample.eventId}
                  data-testid={`sample-card-${sample.id || sample.eventId}`}
                  className="glass p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 space-y-5 border border-gray-200/50 dark:border-gray-700/50"
                >
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/60 dark:border-gray-700/60 pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-400/20 text-yellow-800 dark:text-yellow-300 border border-yellow-400/30">
                        <Laptop className="h-3.5 w-3.5" />
                        {sample.sourceApp || 'Desktop'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(sample.sentAt || sample.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {sample.analysis?.changed || errors.length > 0 ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          {errors.length} {errors.length === 1 ? 'ошибка' : 'ошибок'}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Без ошибок
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Visual Diff Viewer */}
                  {renderDiffViewer(sample)}

                  {/* Russian Summary Explanation */}
                  {summaryRu && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3.5 flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-yellow-700 dark:text-yellow-400 block mb-0.5">
                          Пояснение преподавателя:
                        </span>
                        <p className="text-sm text-gray-800 dark:text-gray-200">{summaryRu}</p>
                      </div>
                    </div>
                  )}

                  {/* Error Breakdown Badges */}
                  {errors.length > 0 && (
                    <div className="space-y-3 pt-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Найденные недочеты ({errors.length}):
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {errors.map((err, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/80 space-y-2"
                          >
                            <div className="flex items-center justify-between text-xs font-medium">
                              <span className="px-2 py-0.5 rounded-md bg-yellow-400/20 text-yellow-800 dark:text-yellow-300 font-semibold border border-yellow-400/30 flex items-center gap-1">
                                <Tag className="h-3 w-3" /> {err.topic || 'Общая грамматика'}
                              </span>
                              {err.confidence && (
                                <span className="text-gray-400 text-[10px]">
                                  {Math.round(err.confidence * 100)}% уверены
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <span className="line-through text-red-500 dark:text-red-400">{err.original}</span>
                              <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                              <span className="text-emerald-600 dark:text-emerald-400">{err.correction}</span>
                            </div>

                            {err.explanationRu && (
                              <p className="text-xs text-gray-600 dark:text-gray-300">{err.explanationRu}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback Controls Footer */}
                  <div className="pt-3 border-t border-gray-200/60 dark:border-gray-700/60 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {/* Helpful Button */}
                      <button
                        data-testid={`feedback-helpful-${sample.id}`}
                        onClick={() => handleFeedback(sample.id, 'helpful')}
                        disabled={actionLoading[`${sample.id}-helpful`] || isHelpfulSubmitted}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          isHelpfulSubmitted
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 cursor-default'
                            : 'bg-gray-100 dark:bg-gray-800 hover:bg-emerald-500/20 hover:text-emerald-700 dark:hover:text-emerald-300 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <ThumbsUp className={`h-3.5 w-3.5 ${isHelpfulSubmitted ? 'fill-current' : ''}`} />
                        <span>{isHelpfulSubmitted ? 'Полезно ✓' : 'Полезно'}</span>
                      </button>

                      {/* Undo Progress Impact Button */}
                      <button
                        data-testid={`feedback-undo-${sample.id}`}
                        onClick={() => handleFeedback(sample.id, 'undo_progress')}
                        disabled={actionLoading[`${sample.id}-undo_progress`] || isUndoSubmitted}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          isUndoSubmitted
                            ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 cursor-default'
                            : 'bg-gray-100 dark:bg-gray-800 hover:bg-purple-500/20 hover:text-purple-700 dark:hover:text-purple-300 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        <span>{isUndoSubmitted ? 'Влияние отменено ✓' : 'Отменить влияние на прогресс'}</span>
                      </button>
                    </div>

                    {/* Secondary Feedback Dropdown/Badge */}
                    <div className="flex items-center gap-2 text-xs">
                      {isHelpfulSubmitted && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Оценка принята</span>
                      )}
                      {isUndoSubmitted && (
                        <span className="text-purple-600 dark:text-purple-400 font-medium">Прогресс восстановлен</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 glass p-4 rounded-2xl">
              <div className="text-xs text-gray-500">
                Показано {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filteredSamples.length)} из {filteredSamples.length} записей
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition"
                  aria-label="Предыдущая страница"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <span className="text-xs font-bold px-3 py-1 bg-yellow-400/20 text-yellow-800 dark:text-yellow-300 rounded-lg">
                  {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition"
                  aria-label="Следующая страница"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="ml-2 px-2.5 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none"
                >
                  <option value={5}>5 на стр.</option>
                  <option value={10}>10 на стр.</option>
                  <option value={20}>20 на стр.</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CorrectionInbox;
