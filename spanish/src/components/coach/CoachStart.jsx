import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, Phone } from 'lucide-react';
import { coachApi } from '../../utils/coachApi';
import { unlockCoachAudio } from '../../hooks/useCoachSpeech';
import { BackLink, Card, CoachPage, ErrorNote, Spinner } from './CoachUI';
import { CustomScenarioForm, CustomTopicForm } from './CoachCustomForms';

export default function CoachStart() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'call' ? 'call' : 'chat';
  const [tab, setTab] = useState(searchParams.get('tab') === 'roles' ? 'roles' : 'topics');
  const [catalog, setCatalog] = useState(null);
  const [focus, setFocus] = useState([]);
  const [recentCustom, setRecentCustom] = useState({ topics: [], scenarios: [] });
  const [starting, setStarting] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    coachApi.catalog().then(setCatalog).catch((loadError) => setError(loadError.message));
    coachApi.dashboard().then((data) => {
      setFocus(data.focus || []);
      if (data.recent_custom) setRecentCustom(data.recent_custom);
    }).catch(() => {});
  }, []);

  const start = async ({ topicId = null, scenarioId = null, customTopic = null, customScenario = null, key = null }) => {
    unlockCoachAudio();
    setStarting(key || topicId || scenarioId);
    setError('');
    try {
      const session = await coachApi.startSession({ mode, topicId, scenarioId, customTopic, customScenario });
      navigate(mode === 'call' ? `/coach/call/${session.id}` : `/coach/chat/${session.id}`, { replace: true });
    } catch (startError) {
      setError(startError.message);
      setStarting(null);
    }
  };

  const setMode = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set('mode', next);
    setSearchParams(params, { replace: true });
  };

  const items = tab === 'topics' ? catalog?.topics : catalog?.scenarios;

  return (
    <CoachPage>
      <BackLink to="/" label="Главная" />
      <h1 className="text-2xl sm:text-3xl font-extrabold c-text">О чём поговорим?</h1>

      <div className="mt-4 inline-flex p-1 rounded-xl c-panel">
        {[
          { id: 'chat', label: 'Чат + голосовые', icon: MessageCircle },
          { id: 'call', label: 'Звонок', icon: Phone },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2 transition-colors ${mode === id ? 'c-btn-primary' : 'c-muted'}`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>
      <p className="c-muted text-sm mt-2">
        {mode === 'call'
          ? 'Говоришь вслух в реальном времени. Исправления не мешают разговору — всё будет в разборе после звонка. Лучше в наушниках.'
          : 'Пиши или отправляй голосовые. Под каждой твоей фразой — короткая проверка, в конце — полный разбор.'}
      </p>

      {focus.length > 0 && (
        <div className="mt-4 c-panel rounded-xl px-4 py-3 text-sm">
          <span className="c-muted">Лусия незаметно даст тебе потренировать: </span>
          <span className="font-semibold c-text">{focus.map((spot) => spot.title_ru).join(' · ')}</span>
        </div>
      )}

      <div className="flex gap-5 mt-6 border-b c-border">
        {[
          { id: 'topics', label: 'Темы' },
          { id: 'roles', label: 'Жизненные ситуации' },
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`pb-2.5 -mb-px text-sm font-bold border-b-2 transition-colors ${tab === id ? 'c-text' : 'c-muted border-transparent'}`}
            style={tab === id ? { borderColor: 'var(--c-accent)' } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4"><ErrorNote message={error} /></div>

      {!catalog ? (
        <div className="py-16 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {tab === 'topics'
            ? <CustomTopicForm recent={recentCustom.topics} starting={starting} onStart={start} />
            : <CustomScenarioForm recent={recentCustom.scenarios} starting={starting} onStart={start} />}
          {items.map((item) => {
            const isStarting = starting === item.id;
            return (
              <Card
                key={item.id}
                as="button"
                type="button"
                disabled={Boolean(starting)}
                onClick={() => start(tab === 'topics' ? { topicId: item.id } : { scenarioId: item.id })}
                className={`p-4 text-left flex items-start gap-3 transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${isStarting ? 'ring-2' : ''}`}
                style={isStarting ? { '--tw-ring-color': 'var(--c-accent)' } : undefined}
              >
                <span className="text-2xl leading-none mt-0.5">{item.emoji}</span>
                <span className="min-w-0">
                  <span className="block font-bold c-text">{item.title_ru}</span>
                  <span className="block c-muted text-[13px] mt-0.5 leading-snug">{item.subtitle_ru}</span>
                  {item.goal_ru && <span className="block text-[12px] mt-1.5 c-accent font-semibold leading-snug">Цель: {item.goal_ru}</span>}
                </span>
                {isStarting && <Spinner className="w-4 h-4 ml-auto c-muted flex-shrink-0" />}
              </Card>
            );
          })}
        </div>
      )}
    </CoachPage>
  );
}
