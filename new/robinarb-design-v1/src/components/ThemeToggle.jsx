export default function ThemeToggle({ theme, onChange, compact = false }) {
  return (
    <div className={`theme-toggle${compact ? ' compact' : ''}`} aria-label="Тема рабочего пространства">
      <button
        type="button"
        className={theme === 'light' ? 'active' : ''}
        aria-pressed={theme === 'light'}
        onClick={() => onChange('light')}
        title="Светлая хромо-серая тема"
      >
        <span aria-hidden="true">☼</span>
        <span>Светлая</span>
      </button>
      <button
        type="button"
        className={theme === 'dark' ? 'active' : ''}
        aria-pressed={theme === 'dark'}
        onClick={() => onChange('dark')}
        title="Тёмная графитовая тема"
      >
        <span aria-hidden="true">◐</span>
        <span>Тёмная</span>
      </button>
    </div>
  );
}
