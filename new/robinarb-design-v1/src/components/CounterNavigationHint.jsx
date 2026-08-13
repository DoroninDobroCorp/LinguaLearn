export default function CounterNavigationHint({ guidance, compact = false }) {
  if (!guidance?.provider_label || !guidance?.bookmaker_label) return null;

  const content = (
    <>
      <span className="counter-navigation-kicker">Где смотреть и ставить</span>
      <strong>{guidance.bookmaker_label} → {guidance.provider_label}</strong>
      {guidance.avoid_provider_label && (
        <span className="counter-navigation-warning">
          Не открывай {guidance.avoid_provider_label}
        </span>
      )}
    </>
  );

  const className = `counter-navigation-hint${compact ? ' compact' : ''}`;
  if (!guidance.url) return <div className={className}>{content}</div>;

  return (
    <a
      className={className}
      href={guidance.url}
      target="_blank"
      rel="noreferrer"
      title={`Открыть ${guidance.bookmaker_label}, ${guidance.provider_label}`}
      onClick={(event) => event.stopPropagation()}
    >
      {content}
      <span className="counter-navigation-open">Открыть ↗</span>
    </a>
  );
}
