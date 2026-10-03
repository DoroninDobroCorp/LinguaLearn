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
            LinguaLearn Spanish
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', maxWidth: '360px', marginBottom: '20px', lineHeight: 1.5 }}>
            Произошла заминка при отображении страницы.
          </p>
          {this.state.error && (
            <div style={{
              textAlign: 'left',
              background: '#fef2f2',
              color: '#991b1b',
              padding: '12px 14px',
              borderRadius: '12px',
              fontSize: '11px',
              maxWidth: '380px',
              marginBottom: '16px',
              overflowX: 'auto',
              fontFamily: 'monospace',
              border: '1px solid #fecaca'
            }}>
              <strong>{String(this.state.error?.message || this.state.error)}</strong>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '280px' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 16px',
                borderRadius: '14px',
                background: 'linear-gradient(to right, #d946ef, #9333ea)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(147, 51, 234, 0.3)'
              }}
            >
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
