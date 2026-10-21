import React, { useState } from 'react';
import { PenLine, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, Spinner } from './CoachUI';

const TOPIC_IDEAS = [
  'Обсудить сериал, который я сейчас смотрю',
  'Как прошёл мой день на работе',
  'Мои планы на отпуск',
  'Что меня раздражает в Буэнос-Айресе',
];

const SCENARIO_IDEAS = [
  { character: 'мастер, который пришёл чинить кондиционер', goal: 'Объяснить, что кондиционер течёт и шумит, узнать причину, цену и сроки ремонта', voice: 'male', formal: false },
  { character: 'администратор в клинике', goal: 'Записать ребёнка к педиатру на эту неделю и уточнить, какие документы взять', voice: 'female', formal: true },
  { character: 'мама одноклассника моей дочери', goal: 'Договориться о совместной прогулке детей в субботу и обменяться контактами', voice: 'female', formal: false },
];

function FormShell({ title, subtitle, open, onToggle, children }) {
  return (
    <Card className="p-4 sm:col-span-2 lg:col-span-3" style={open ? { borderColor: 'var(--c-accent)' } : undefined}>
      <button type="button" onClick={onToggle} className="w-full flex items-start gap-3 text-left">
        <span className="w-9 h-9 rounded-xl c-bg-accent flex items-center justify-center flex-shrink-0"><PenLine className="w-4 h-4" /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold c-text">{title}</span>
          <span className="block c-muted text-[13px] mt-0.5 leading-snug">{subtitle}</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 c-muted mt-1" /> : <ChevronDown className="w-4 h-4 c-muted mt-1" />}
      </button>
      {open && <div className="mt-4 animate-fade-in">{children}</div>}
    </Card>
  );
}

function RecentChips({ items, label, onPick }) {
  if (!items?.length) return null;
  return (
    <div className="mb-3">
      <div className="text-xs font-bold c-muted mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <button key={index} type="button" onClick={() => onPick(item)} className="c-btn-ghost px-3 py-1.5 rounded-full text-[13px] font-semibold text-left max-w-full truncate">
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CustomTopicForm({ recent, starting, onStart }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const busy = starting === 'custom-topic';
  const submit = (value = text) => {
    const topic = value.trim();
    if (topic.length >= 3) onStart({ customTopic: topic, key: 'custom-topic' });
  };
  return (
    <FormShell
      title="Своя тема"
      subtitle="Напиши, о чём хочется поговорить — можно по-русски. Лусия подхватит."
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <RecentChips
        label="Недавние"
        items={(recent || []).map((item) => ({ label: item.text, value: item.text }))}
        onPick={(item) => submit(item.value)}
      />
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        maxLength={300}
        placeholder="Например: хочу обсудить, как выбрать школу для дочки в Буэнос-Айресе"
        className="c-input w-full rounded-xl px-3.5 py-2.5 text-[15px] resize-none"
      />
      <div className="flex flex-wrap gap-2 mt-2">
        {TOPIC_IDEAS.map((idea) => (
          <button key={idea} type="button" onClick={() => setText(idea)} className="text-[12px] c-muted underline underline-offset-2 hover:opacity-80">{idea}</button>
        ))}
      </div>
      <button type="button" onClick={() => submit()} disabled={Boolean(starting) || text.trim().length < 3} className="c-btn-primary mt-4 px-5 py-2.5 rounded-xl font-bold inline-flex items-center gap-2">
        {busy && <Spinner />} Начать разговор
      </button>
    </FormShell>
  );
}

export function CustomScenarioForm({ recent, starting, onStart }) {
  const [open, setOpen] = useState(false);
  const [character, setCharacter] = useState('');
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [voice, setVoice] = useState('female');
  const [formal, setFormal] = useState(false);
  const busy = starting === 'custom-scenario';
  const ready = character.trim().length >= 3 && goal.trim().length >= 5;

  const fill = (scenario) => {
    setCharacter(scenario.character || '');
    setName(scenario.name || '');
    setGoal(scenario.goal || '');
    setVoice(scenario.voice === 'male' ? 'male' : 'female');
    setFormal(Boolean(scenario.formal));
  };

  const submit = (scenario = { character, name, goal, voice, formal }) => {
    onStart({ customScenario: scenario, key: 'custom-scenario' });
  };

  const toggle = (options, value, setValue) => (
    <div className="inline-flex p-1 rounded-xl c-panel">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => setValue(option.value)}
          className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${value === option.value ? 'c-btn-primary' : 'c-muted'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <FormShell
      title="Своя ситуация"
      subtitle="Придумай сцену из своей жизни: кого играет собеседник и чего ты хочешь добиться."
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <RecentChips
        label="Недавние — нажми, чтобы сыграть снова"
        items={(recent || []).map((item) => ({ label: `${item.character}: ${item.goal}`, value: item }))}
        onPick={(item) => submit(item.value)}
      />
      <label className="block">
        <span className="text-sm font-bold c-text">Кого играет собеседник</span>
        <input
          value={character}
          onChange={(event) => setCharacter(event.target.value)}
          maxLength={200}
          placeholder="Например: мастер, который пришёл чинить кондиционер"
          className="c-input w-full mt-1.5 rounded-xl px-3.5 py-2.5 text-[15px]"
        />
      </label>
      <label className="block mt-3">
        <span className="text-sm font-bold c-text">Ситуация и твоя цель</span>
        <textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Например: кондиционер течёт — хочу понять причину и договориться о цене и сроках"
          className="c-input w-full mt-1.5 rounded-xl px-3.5 py-2.5 text-[15px] resize-none"
        />
      </label>
      <label className="block mt-3">
        <span className="text-sm font-bold c-text">Имя персонажа <span className="c-muted font-normal">(необязательно)</span></span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder="Например: Raúl"
          className="c-input w-full mt-1.5 rounded-xl px-3.5 py-2.5 text-[15px]"
        />
      </label>
      <div className="flex flex-wrap gap-x-5 gap-y-3 mt-4">
        <div>
          <div className="text-xs font-bold c-muted mb-1">Голос</div>
          {toggle([{ value: 'female', label: 'Женский' }, { value: 'male', label: 'Мужской' }], voice, setVoice)}
        </div>
        <div>
          <div className="text-xs font-bold c-muted mb-1">Обращение</div>
          {toggle([{ value: false, label: 'На «vos»' }, { value: true, label: 'На «usted»' }], formal, setFormal)}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
        <span className="text-[12px] c-faint">Идеи:</span>
        {SCENARIO_IDEAS.map((idea) => (
          <button key={idea.character} type="button" onClick={() => fill(idea)} className="text-[12px] c-muted underline underline-offset-2 hover:opacity-80">{idea.character}</button>
        ))}
      </div>
      <button type="button" onClick={() => submit()} disabled={Boolean(starting) || !ready} className="c-btn-primary mt-4 px-5 py-2.5 rounded-xl font-bold inline-flex items-center gap-2">
        {busy && <Spinner />} Начать сцену
      </button>
    </FormShell>
  );
}
