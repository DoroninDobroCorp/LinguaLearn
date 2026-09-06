import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('AppErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #fdf2f8 0%, #f5d0fe 50%, #fdf2f8 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🇪🇸</div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#9333ea', marginBottom: '8px' }}>
            LinguaLearn Spanish (Офлайн)
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', maxWidth: '360px', marginBottom: '20px', lineHeight: 1.5 }}>
            При запуске интерфейса возникла заминка. Вы можете перейти напрямую в тренажер или словарь:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '280px' }}>
            <a href="/spanish/exercises" style={{
              padding: '12px 16px',
              borderRadius: '14px',
              background: 'linear-gradient(to right, #d946ef, #9333ea)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '14px',
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(147, 51, 234, 0.3)'
            }}>
              🎯 Открыть Тренажер
            </a>
            <a href="/spanish/vocabulary" style={{
              padding: '12px 16px',
              borderRadius: '14px',
              background: '#ffffff',
              border: '2px solid #e9d5ff',
              color: '#9333ea',
              fontWeight: 700,
              fontSize: '14px',
              textDecoration: 'none'
            }}>
              📖 Открыть Словарь
            </a>
            <button onClick={() => window.location.reload()} style={{
              marginTop: '6px',
              padding: '10px 16px',
              borderRadius: '14px',
              background: 'transparent',
              border: 'none',
              color: '#6b7280',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}>
              Перезагрузить страницу 🔄
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter basename="/spanish">
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/spanish/sw.js', { scope: '/spanish' }).catch((error) => {
      console.error('Spanish offline service worker registration failed:', error);
    });
  });
}
