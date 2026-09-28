import React, { useState, useRef } from 'react';
import { X, Upload, Link as LinkIcon, Film, Image as ImageIcon, Zap, Trash2, Check, AlertCircle } from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { detectMediaType } from './WordIllustration';

export default function AttachMediaModal({
  isOpen,
  onClose,
  entry,
  onMediaUpdated
}) {
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen || !entry) return null;

  const currentMedia = previewData?.url || mediaUrlInput.trim() || entry.image_url || '';
  const detectedType = detectMediaType(currentMedia);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: up to 25 MB
    if (file.size > 25 * 1024 * 1024) {
      setError('Файл слишком большой. Максимальный размер 25 МБ.');
      return;
    }

    setError('');
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewData({
        url: event.target.result,
        fileName: file.name,
        isBase64: true
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      let payload = {};

      if (previewData?.isBase64) {
        payload = {
          mediaData: previewData.url,
          fileName: previewData.fileName
        };
      } else if (mediaUrlInput.trim()) {
        payload = {
          mediaUrl: mediaUrlInput.trim()
        };
      } else {
        setError('Укажите ссылку или выберите файл для загрузки.');
        setIsSubmitting(false);
        return;
      }

      const res = await profileFetch(profileApiUrl(`/spanish/api/vocabulary/${entry.id}/media`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Не удалось сохранить медиа');
      }

      const result = await res.json();
      if (onMediaUpdated) {
        onMediaUpdated(entry.id, result.image_url);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Ошибка при сохранении медиа');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMedia = async () => {
    if (!confirm('Удалить прикрепленное медиа и вернуться к автоматической картинке?')) return;
    setIsSubmitting(true);
    try {
      const res = await profileFetch(profileApiUrl(`/spanish/api/vocabulary/${entry.id}/media`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaUrl: null })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Не удалось удалить медиа');
      }

      if (onMediaUpdated) {
        onMediaUpdated(entry.id, null);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Ошибка при удалении медиа');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-purple-200 dark:border-gray-700 relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>🎬</span>
              <span>Медиа для слова:</span>
              <span className="text-purple-600 dark:text-purple-400 font-extrabold">{entry.word}</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Поддерживаются: мини-видео (MP4, WebM), GIF-анимация, Flash (SWF) и фотографии
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Live Media Preview Box */}
        <div className="mt-4 flex flex-col items-center">
          <div className="w-full h-44 sm:h-52 bg-slate-100 dark:bg-gray-900 rounded-2xl border-2 border-dashed border-purple-200 dark:border-gray-700 flex items-center justify-center overflow-hidden relative shadow-inner">
            {currentMedia ? (
              detectedType === 'video' ? (
                <video
                  src={currentMedia}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  className="w-full h-full object-contain"
                />
              ) : detectedType === 'flash' ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-2">
                  <embed
                    src={currentMedia}
                    type="application/x-shockwave-flash"
                    width="100%"
                    height="100%"
                    className="w-full h-full rounded-lg"
                  />
                  <span className="text-[10px] text-amber-600 font-bold mt-1">⚡ Flash SWF (Ruffle)</span>
                </div>
              ) : (
                <img
                  src={currentMedia}
                  alt={entry.word}
                  className="w-full h-full object-contain"
                />
              )
            ) : (
              <div className="text-center p-4 text-gray-400 dark:text-gray-500">
                <Film className="w-10 h-10 mx-auto mb-2 opacity-40 text-purple-500" />
                <p className="text-xs font-semibold">Предпросмотр медиа появится здесь</p>
                <p className="text-[10px] opacity-70 mt-1">MP4 · WebM · GIF · SWF (Flash) · JPG · PNG</p>
              </div>
            )}

            {currentMedia && (
              <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {detectedType === 'video' && '🎬 Видео'}
                {detectedType === 'gif' && '🎞️ GIF'}
                {detectedType === 'flash' && '⚡ Flash'}
                {detectedType === 'image' && '🖼️ Фото'}
              </div>
            )}
          </div>
        </div>

        {/* Input Methods */}
        <div className="mt-4 space-y-3">
          {/* Option A: Direct Web Link */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-purple-600" />
              <span>Ссылка из интернета (URL):</span>
            </label>
            <input
              type="url"
              value={mediaUrlInput}
              onChange={(e) => {
                setMediaUrlInput(e.target.value);
                setPreviewData(null);
              }}
              placeholder="https://.../animation.mp4 или .gif или .swf"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-[11px] text-gray-400 font-bold uppercase">или</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Option B: Local File Picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/ogg,image/gif,image/jpeg,image/png,image/webp,.swf,application/x-shockwave-flash"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{selectedFile ? `Выбран: ${selectedFile.name}` : 'Загрузить файл с устройства (видео, гифка, flash, фото)'}</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          {entry.image_url ? (
            <button
              type="button"
              onClick={handleRemoveMedia}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              title="Сбросить медиа к автоматической картинке"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Сбросить</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || (!mediaUrlInput.trim() && !previewData)}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Сохранение...' : 'Сохранить'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
