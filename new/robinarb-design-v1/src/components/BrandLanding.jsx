import { useState } from 'react';
import ThemeToggle from './ThemeToggle';

const TELEGRAM_CONTACT = 'https://t.me/BohdanCryp';

function BrandMark({ inverse = false }) {
  return (
    <span className={`brand-lockup${inverse ? ' inverse' : ''}`}>
      <span className="brand-mark" aria-hidden="true"><i /></span>
      <span className="brand-word"><b>Robin</b>Arb</span>
    </span>
  );
}

export default function BrandLanding({ onLogin, busy, error, theme, onThemeChange }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onLogin({ username, password });
  };

  return (
    <div className="brand-page">
      <header className="brand-header">
        <a href="#top" className="brand-home" aria-label="RobinArb — наверх">
          <BrandMark />
        </a>
        <nav aria-label="Навигация по странице">
          <a href="#advantage">Преимущество</a>
          <a href="#how">Как работает</a>
          <a href="#safety">Безопасность</a>
        </nav>
        <div className="brand-header-actions">
          <ThemeToggle theme={theme} onChange={onThemeChange} compact />
          <a className="brand-login-link" href="#login">Войти</a>
        </div>
      </header>

      <main id="top">
        <section className="brand-hero">
          <div className="brand-hero-copy">
            <div className="brand-eyebrow"><span /> Арбитраж без пропущенных вилок</div>
            <h1>Больше вилок.<br /><em>Лучшая цена.</em></h1>
            <p className="brand-lead">
              RobinArb открывает сделки, которые не проходят по обычной цене Pinnacle.
              Закрытая среда только для вилочников позволяет нам давать более выгодную
              Robin-цену — и увеличивать число доступных вилок более чем на 50%.
            </p>
            <div className="brand-hero-actions">
              <a className="brand-cta primary" href="#how">Посмотреть, как работает</a>
              <a className="brand-cta secondary" href="#login">У меня уже есть доступ</a>
            </div>
            <div className="brand-proof-row" aria-label="Ключевые преимущества">
              <div><strong>50%+</strong><span>больше доступных вилок</span></div>
              <div><strong>1 flow</strong><span>от Forted до принятия</span></div>
              <div><strong>Exact</strong><span>проверка выбранной цены</span></div>
            </div>
          </div>

          <div className="brand-hero-visual" aria-label="Пример вилки, которую открывает Robin-цена">
            <div className="brand-demo-window">
              <div className="brand-demo-head">
                <span><i /> LIVE OPPORTUNITY</span>
                <span>0.4s</span>
              </div>
              <div className="brand-demo-match">Shepshed Dynamo <span>vs</span> Long Eaton United</div>
              <div className="brand-demo-market">Moneyline · пример</div>
              <div className="brand-demo-route">
                <div className="brand-demo-leg">
                  <span>Внешнее плечо</span>
                  <strong>PaddyPower</strong>
                  <b>@2.020</b>
                </div>
                <div className="brand-demo-arrow">↔</div>
                <div className="brand-demo-leg pin muted">
                  <span>Обычная цена</span>
                  <strong>PIN</strong>
                  <b>@1.940</b>
                  <small>−1.04% · не вилка</small>
                </div>
                <div className="brand-demo-leg robin">
                  <span>Цена Robin</span>
                  <strong>Robin</strong>
                  <b>@2.080</b>
                  <small>+2.48% · доступно</small>
                </div>
              </div>
            </div>
            <img
              className="brand-robin-hero"
              src="/robin-hood-hero.webp"
              alt="Robin показывает более выгодную цену в интерфейсе"
            />
            <div className="brand-visual-note"><span>↑</span> Нашли цену, которая превращает исход в вилку</div>
          </div>
        </section>

        <section className="brand-marquee" aria-label="Главная идея RobinArb">
          <span>ЛУЧШАЯ ЦЕНА</span><i />
          <span>БОЛЬШЕ ВИЛОК</span><i />
          <span>МЕНЬШЕ ПЕРЕКЛЮЧЕНИЙ</span><i />
          <span>ТОЧНАЯ ПРОВЕРКА</span>
        </section>

        <section className="brand-advantage" id="advantage">
          <div className="brand-section-copy">
            <div className="brand-eyebrow"><span /> Почему мы можем дать больше</div>
            <h2>Не букмекер для всех.<br />Инструмент для вилочников.</h2>
            <p>
              Мы намеренно ограничиваем модель. В Robin нельзя ставить на всю линию Pinnacle,
              играть плюсовые одиночные стратегии или догонять убытки. Так риск остаётся
              предсказуемым, а часть преимущества возвращается пользователю в цене.
            </p>
          </div>

          <div className="brand-advantage-grid">
            <article><span>01</span><h3>Только арбитраж</h3><p>Каждая ставка начинается с внешнего хеджа. Случайный плюсовый трафик не размывает модель.</p></article>
            <article><span>02</span><h3>Не вся линия</h3><p>Доступны только исходы из найденных вилок — Robin не превращается во второй Pinnacle.</p></article>
            <article><span>03</span><h3>Без догонов</h3><p>Лимиты и привязка к вилке защищают пул от стратегий, под которые пришлось бы ухудшать цену всем.</p></article>
            <article className="accent"><span>04</span><h3>Больше 50%</h3><p>Лучшая Robin-цена делает положительными комбинации, которые пользователь Forted + Pinnacle пропустил бы.</p></article>
          </div>

          <div className="brand-robin-explain-wrap">
            <img
              className="brand-robin-explain"
              src="/robin-hood-more-forks.webp"
              alt="Robin открывает дополнительные доступные вилки"
            />
            <div className="brand-explain-caption"><b>Серые</b> — обычный доступ <span>Салатовые — новые вилки Robin</span></div>
          </div>
        </section>

        <section className="brand-how" id="how">
          <div className="brand-section-heading">
            <div className="brand-eyebrow"><span /> Один понятный рабочий путь</div>
            <h2>От найденной вилки<br />до точной цены.</h2>
          </div>
          <ol className="brand-steps">
            <li><span>01</span><div><h3>Выберите вилку</h3><p>Forted находит рынок, Robin сразу показывает дополнительную цену и ожидаемое преимущество.</p></div></li>
            <li><span>02</span><div><h3>Поставьте внешнее плечо</h3><p>Сначала хедж у внешнего букмекера. Вы фиксируете фактические сумму и коэффициент.</p></div></li>
            <li><span>03</span><div><h3>Получите exact quote</h3><p>PIN проверяется в выбранной BIA Single-корзине, Robin — по полному точному рынку parser.</p></div></li>
            <li><span>04</span><div><h3>Выберите PIN или Robin</h3><p>Один Calculator показывает обе цены, размер нашего плеча и чистый результат до принятия.</p></div></li>
          </ol>
        </section>

        <section className="brand-safety" id="safety">
          <div>
            <div className="brand-eyebrow light"><span /> Не продаём удобство ценой безопасности</div>
            <h2>Старую цену нельзя принять случайно.</h2>
          </div>
          <p>
            Preview появляется быстро, но PIN становится доступен только после реальной проверки
            BIA Single. При изменении цены RobinArb пересчитывает наше плечо и просит подтверждение.
          </p>
          <div className="brand-safety-status"><i /> EXACT QUOTE REQUIRED</div>
        </section>

        <section className="brand-access" id="login">
          <div className="brand-access-copy">
            <div className="brand-eyebrow"><span /> Закрытый доступ</div>
            <h2>Войдите в<br />рабочее пространство.</h2>
            <p>Доступ выдаётся вручную. Новый аккаунт можно запросить у <a href={TELEGRAM_CONTACT} target="_blank" rel="noreferrer">@BohdanCryp</a> в Telegram.</p>
            <BrandMark />
          </div>

          <form className="brand-login-card" onSubmit={handleSubmit}>
            <div className="brand-login-head"><span>Вход</span><i>SECURE WORKSPACE</i></div>
            <label>
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="Введите имя пользователя"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Введите пароль"
              />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="brand-login-submit" type="submit" disabled={busy}>
              <span>{busy ? 'Входим…' : 'Войти в RobinArb'}</span><b>→</b>
            </button>
            <small>Данные используются только для авторизации в вашем RobinArb workspace.</small>
          </form>
        </section>
      </main>

      <footer className="brand-footer">
        <BrandMark inverse />
        <p>RobinArb · лучшие цены для дисциплинированного арбитража</p>
        <a href={TELEGRAM_CONTACT} target="_blank" rel="noreferrer">Telegram ↗</a>
      </footer>
    </div>
  );
}
