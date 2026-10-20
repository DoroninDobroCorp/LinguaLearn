import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Settings as SettingsIcon } from 'lucide-react';
import { coachApi } from '../../utils/coachApi';
import CoachOnboarding from './CoachOnboarding';
import { BackLink, Card, CoachPage, ErrorNote, SectionTitle, Spinner } from './CoachUI';

export default function CoachSettings() {
  const [learner, setLearner] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    coachApi.profile().then((data) => setLearner(data.learner)).catch((loadError) => setError(loadError.message));
  }, []);

  const forget = async (index) => {
    try {
      const { memory } = await coachApi.forgetMemory(index);
      setLearner((current) => ({ ...current, memory }));
    } catch (forgetError) {
      setError(forgetError.message);
    }
  };

  if (!learner) {
    return <CoachPage narrow><BackLink to="/" label="Главная" />{error ? <ErrorNote message={error} /> : <div className="py-24 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div>}</CoachPage>;
  }

  return (
    <CoachPage narrow>
      <BackLink to="/" label="Главная" />
      <h1 className="text-2xl sm:text-3xl font-extrabold c-text mb-4">Настройки разговоров</h1>
      {saved && <div className="c-bg-good rounded-xl px-4 py-2.5 text-sm mb-3">Сохранено</div>}
      <CoachOnboarding
        key={learner.partner_voice + learner.display_name}
        mode="settings"
        initial={learner}
        onDone={(next) => {
          setLearner(next);
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
        }}
      />

      <SectionTitle>Что Лусия знает о тебе</SectionTitle>
      <Card className="p-5">
        {learner.memory.length === 0 ? (
          <p className="c-muted text-sm">Пока ничего. Лусия запоминает факты, которые ты сама рассказываешь в разговорах, чтобы потом о них спрашивать.</p>
        ) : (
          <ul className="space-y-2">
            {learner.memory.map((fact, index) => (
              <li key={`${index}-${fact}`} className="flex items-start justify-between gap-3 text-[14px] c-text">
                <span>{fact}</span>
                <button type="button" onClick={() => forget(index)} className="c-muted hover:opacity-80 flex-shrink-0" aria-label="Забыть">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link to="/settings" className="mt-6 inline-flex items-center gap-2 text-sm c-muted hover:opacity-80">
        <SettingsIcon className="w-4 h-4" /> Общие настройки приложения
      </Link>
      {error && <div className="mt-3"><ErrorNote message={error} /></div>}
    </CoachPage>
  );
}
