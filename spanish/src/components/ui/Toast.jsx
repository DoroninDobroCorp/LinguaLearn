import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const colors = {
  success: 'bg-green-50 dark:bg-green-900 border-green-500 text-green-800 dark:text-green-200',
  error: 'bg-red-50 dark:bg-red-900 border-red-500 text-red-800 dark:text-red-200',
  warning: 'bg-pink-50 dark:bg-fuchsia-900 border-fuchsia-500 text-fuchsia-800 dark:text-pink-200',
  info: 'bg-blue-50 dark:bg-blue-900 border-blue-500 text-blue-800 dark:text-blue-200',
};

export function Toast({ message, type = 'info', onClose, duration = 5000 }) {
  const Icon = icons[type];

  useEffect(() => {
    if (duration) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  return (
    <div className={`flex items-center space-x-3 p-4 rounded-lg border-2 shadow-lg animate-slide-up ${colors[type]}`}>
      <Icon className="h-5 w-5 flex-shrink-0" />
      <p className="flex-1 font-medium">{message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 hover:opacity-70 transition-opacity"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
          duration={toast.duration}
        />
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = React.useState([]);

  const addToast = React.useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = React.useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
