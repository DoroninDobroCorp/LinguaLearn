import React, { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

export const UI_TRANSLATIONS = {
  ru: {
    // Navigation
    nav_today: 'Главная',
    nav_stories: 'Истории',
    nav_quests: 'Квесты & Чат',
    nav_exercises: 'Тренажер',
    nav_vocabulary: 'Словарь',
    nav_curriculum: 'Карта тем',
    nav_settings: 'Настройки',
    app_title: 'LinguaLearn Испанский',

    // Today Dashboard
    today_hero_badge: 'Твой личный тренер по испанскому',
    today_hero_greeting: 'Привет!',
    today_hero_desc: 'Вот твой персональный план на сегодня (~15 минут). Проходи темы по шагам или выбирай то, что интересно сейчас.',
    today_streak: 'Дней подряд',
    today_xp: 'Очков XP',
    today_level: 'Уровень',
    today_recommended_title: 'Твой маршрут на сегодня',
    today_recommended_time: '~15 минут на всё',
    today_step_prefix: 'Шаг',
    today_daily_quests: 'Миссии на сегодня',
    today_daily_quests_sub: 'Выполни все 3 для бонусного опыта',
    today_explore_all: 'Все разделы для свободной практики',
    today_a1_progress_title: 'Прогресс уровня A1',
    today_a1_remaining: 'осталось до завершения A1',
    today_a1_topics_count: 'тем освоено',
    today_a1_map_btn: 'Открыть интерактивную карту с Матео',

    // Gym / Exercises
    gym_title: 'Интерактивный тренажер испанского',
    gym_sub: 'Выбирай формат практики для развития речи, грамматики и словарного запаса.',
    tab_word_tiles: 'Конструктор фраз',
    tab_speed_match: 'Speed Match Blitz',
    tab_error_detective: 'Детектив ошибок',
    tab_verb_drills: 'Спряжения глаголов',
    tab_classic_quiz: 'Тесты и Вставка слов',
    tab_translation: 'Перевод предложений',

    // Verb Drills
    verb_drills_title: 'Тренировка спряжения глаголов',
    verb_drills_sub: 'Отрабатывай правильные и неправильные глаголы с аргентинским voseo.',
    verb_types_label: 'Тип глаголов:',
    verb_pronouns_label: 'Местоимения:',
    verb_mode_label: 'Режим тренировки:',
    verb_start_btn: 'Начать тренировку',
    verb_check_btn: 'Проверить',
    verb_next_btn: 'Следующий глагол',
    verb_type_regular: 'Правильные глаголы (-AR, -ER, -IR)',
    verb_type_four_key: '4 главных неправильных (Ser, Estar, Tener, Ir)',
    verb_type_ser: 'Глагол Ser (быть по сути)',
    verb_type_estar: 'Глагол Estar (находиться / состояние)',
    verb_type_tener: 'Глагол Tener (иметь)',
    verb_type_ir: 'Глагол Ir (идти, ехать)',
    verb_type_ser_estar_context: 'Ser vs Estar в контексте предложений',

    // Stories
    stories_title: 'Интерактивные истории',
    stories_sub: 'Читай увлекательные новеллы, делай выбор за героя и сохраняй новые слова в 1 тап.',
    stories_back_btn: 'Назад к списку историй',
    stories_key_vocab: 'Ключевые слова (нажми для перевода и сохранения):',
    stories_comprehension: 'Проверь понимание прочитанного:',
    stories_decisions: 'Что ты решишь сделать дальше? (Твой выбор):',
    stories_completed: 'Поздравляем! История завершена',
    stories_re_read: 'Перечитать с другими решениями',
    stories_more_btn: 'Выбрать другую историю',
    stories_all_levels: 'Все уровни',

    // Roleplay / Quests
    quests_title: 'Сценарные ролевые квесты с AI',
    quests_sub: 'Практикуй реальный испанский в жизненных ситуациях с живыми персонажами.',
    quests_tab_roleplay: '🎭 Сюжетные квесты',
    quests_tab_tutor: '🤖 Свободный AI-репетитор',
    quests_objectives: 'Цели миссии',
    quests_feedback_title: 'Советы и подсказки в реальном времени:',
    quests_hint_title: 'Идеи для реплик:',
    quests_completed_badge: 'Миссия пройдена!',

    // Curriculum & Map
    map_tab_adventure: '🗺️ Интерактивная карта A1 с Матео',
    map_tab_full_list: '📋 Полный каталог тем (A1–C2)',
    map_mateo_guide: 'Матео подсказывает: следующая тема для изучения',
    map_open_theory: 'Учить теорию',
    map_mark_mastered: 'Отметить как выученную',
    map_mark_unmastered: 'Вернуть в изучение',
    map_a1_mastery: 'Освоение уровня A1',

    // General
    btn_listen: 'Слушать произношение',
    btn_save_word: '+ Сохранить слово',
    btn_saved_word: '✓ В словаре!',
    btn_check: 'Проверить ответ',
    btn_next: 'Далее',
    btn_retry: 'Попробовать снова',
    status_mastered: 'Освоено',
    status_in_progress: 'В процессе',
    status_not_started: 'Не начато'
  },
  en: {
    // Navigation
    nav_today: 'Today',
    nav_stories: 'Stories',
    nav_quests: 'Quests & Chat',
    nav_exercises: 'Gym',
    nav_vocabulary: 'Vocabulary',
    nav_curriculum: 'Curriculum Map',
    nav_settings: 'Settings',
    app_title: 'LinguaLearn Spanish',

    // Today Dashboard
    today_hero_badge: 'Your Personal Spanish Coach',
    today_hero_greeting: 'Hello!',
    today_hero_desc: 'Here is your personalized daily plan (~15 minutes). Follow the recommended steps or explore whatever you like.',
    today_streak: 'Day Streak',
    today_xp: 'XP Points',
    today_level: 'Level',
    today_recommended_title: "Today's Recommended Flow",
    today_recommended_time: '~15 min total',
    today_step_prefix: 'Step',
    today_daily_quests: 'Daily Quests',
    today_daily_quests_sub: 'Complete all 3 for bonus XP',
    today_explore_all: 'Explore all learning modules',
    today_a1_progress_title: 'A1 Level Progress',
    today_a1_remaining: 'remaining to complete A1',
    today_a1_topics_count: 'topics mastered',
    today_a1_map_btn: 'Open Interactive A1 Map with Mateo',

    // Gym / Exercises
    gym_title: 'Interactive Spanish Gym',
    gym_sub: 'Choose a practice mode to strengthen fluency, listening, and vocabulary.',
    tab_word_tiles: 'Word Tiles',
    tab_speed_match: 'Speed Match Blitz',
    tab_error_detective: 'Error Detective',
    tab_verb_drills: 'Verb Conjugations',
    tab_classic_quiz: 'Quiz & Fill-in',
    tab_translation: 'Sentence Translation',

    // Verb Drills
    verb_drills_title: 'Verb Conjugation Training',
    verb_drills_sub: 'Master regular and irregular verbs including Argentine voseo.',
    verb_types_label: 'Verb Category:',
    verb_pronouns_label: 'Pronouns:',
    verb_mode_label: 'Practice Mode:',
    verb_start_btn: 'Start Training',
    verb_check_btn: 'Check Answer',
    verb_next_btn: 'Next Verb',
    verb_type_regular: 'Regular Verbs (-AR, -ER, -IR)',
    verb_type_four_key: '4 Key Irregulars (Ser, Estar, Tener, Ir)',
    verb_type_ser: 'Verb Ser (identity / essence)',
    verb_type_estar: 'Verb Estar (location / state)',
    verb_type_tener: 'Verb Tener (to have)',
    verb_type_ir: 'Verb Ir (to go)',
    verb_type_ser_estar_context: 'Ser vs Estar in context sentences',

    // Stories
    stories_title: 'Interactive Stories',
    stories_sub: 'Read engaging novellas, make branch choices, and save words in 1 tap.',
    stories_back_btn: 'Back to Stories Catalog',
    stories_key_vocab: 'Key vocabulary (tap to translate and save):',
    stories_comprehension: 'Check your understanding:',
    stories_decisions: 'What do you decide to do next? (Your choice):',
    stories_completed: 'Congratulations! Story Completed',
    stories_re_read: 'Re-read with other choices',
    stories_more_btn: 'Explore more stories',
    stories_all_levels: 'All Levels',

    // Roleplay / Quests
    quests_title: 'Situational AI Roleplay Quests',
    quests_sub: 'Practice authentic Spanish in real-life situations with interactive characters.',
    quests_tab_roleplay: '🎭 Roleplay Quests',
    quests_tab_tutor: '🤖 Free AI Tutor',
    quests_objectives: 'Mission Objectives',
    quests_feedback_title: 'Live Cultural & Grammar Feedback:',
    quests_hint_title: 'Suggested replies:',
    quests_completed_badge: 'Quest Completed!',

    // Curriculum & Map
    map_tab_adventure: '🗺️ Interactive A1 Map with Mateo',
    map_tab_full_list: '📋 Full Curriculum Catalog (A1–C2)',
    map_mateo_guide: 'Mateo advises: your next topic to learn',
    map_open_theory: 'Learn Theory',
    map_mark_mastered: 'Mark as Mastered',
    map_mark_unmastered: 'Mark as In Progress',
    map_a1_mastery: 'A1 Level Mastery',

    // General
    btn_listen: 'Listen to Audio',
    btn_save_word: '+ Save Word',
    btn_saved_word: '✓ Saved in Vocab!',
    btn_check: 'Check Answer',
    btn_next: 'Next',
    btn_retry: 'Try Again',
    status_mastered: 'Mastered',
    status_in_progress: 'In Progress',
    status_not_started: 'Not Started'
  },
  es: {
    // Navigation
    nav_today: 'Hoy',
    nav_stories: 'Historias',
    nav_quests: 'Quests & Chat',
    nav_exercises: 'Gimnasio',
    nav_vocabulary: 'Vocabulario',
    nav_curriculum: 'Curriculum',
    nav_settings: 'Ajustes',
    app_title: 'LinguaLearn Español',

    // Today Dashboard
    today_hero_badge: 'Tu Entrenador Personal de Español',
    today_hero_greeting: '¡Hola!',
    today_hero_desc: 'Aquí tienes tu plan recomendado para hoy (~15 minutos). Sigue los 3 pasos guiados o elige la actividad que prefieras.',
    today_streak: 'Racha días',
    today_xp: 'Puntos XP',
    today_level: 'Nivel',
    today_recommended_title: 'Tu Ruta Recomendada para Hoy',
    today_recommended_time: '~15 minutos en total',
    today_step_prefix: 'Paso',
    today_daily_quests: 'Misiones del Día',
    today_daily_quests_sub: 'Completa las 3 para bonus de XP',
    today_explore_all: 'Explora todas las secciones',
    today_a1_progress_title: 'Progreso del Nivel A1',
    today_a1_remaining: 'restante para completar A1',
    today_a1_topics_count: 'temas dominados',
    today_a1_map_btn: 'Abrir mapa interactivo con Mateo',

    // Gym / Exercises
    gym_title: 'Gimnasio de Español Interactivo',
    gym_sub: 'Elige una modalidad dinámica de práctica para fortalecer tu fluidez, oído y vocabulario.',
    tab_word_tiles: 'Constructor de Frases',
    tab_speed_match: 'Speed Match Blitz',
    tab_error_detective: 'Cazador de Errores',
    tab_verb_drills: 'Verbos & Conjugaciones',
    tab_classic_quiz: 'Quiz & Completar',
    tab_translation: 'Traducción de frases',

    // Verb Drills
    verb_drills_title: 'Entrenamiento de Conjugación Verbal',
    verb_drills_sub: 'Domina los verbos regulares e irregulares con voseo argentino.',
    verb_types_label: 'Tipo de Verbos:',
    verb_pronouns_label: 'Pronombres:',
    verb_mode_label: 'Modo de entrenamiento:',
    verb_start_btn: 'Comenzar Entrenamiento',
    verb_check_btn: 'Comprobar',
    verb_next_btn: 'Siguiente Verbo',
    verb_type_regular: 'Verbos regulares (-AR, -ER, -IR)',
    verb_type_four_key: '4 verbos clave (Ser, Estar, Tener, Ir)',
    verb_type_ser: 'Verbo Ser (identidad / esencia)',
    verb_type_estar: 'Verbo Estar (ubicación / estado)',
    verb_type_tener: 'Verbo Tener (posesión / sensaciones)',
    verb_type_ir: 'Verbo Ir (movimiento)',
    verb_type_ser_estar_context: 'Ser vs Estar en contexto',

    // Stories
    stories_title: 'Cuentos Interactivos',
    stories_sub: 'Lee historias apasionantes, toma decisiones que cambian el final y aprende vocabulario en 1 toque.',
    stories_back_btn: 'Volver a las Historias',
    stories_key_vocab: 'Vocabulario clave (Toca para traducir y guardar):',
    stories_comprehension: 'Comprueba tu comprensión:',
    stories_decisions: '¿Qué decides hacer ahora? (Elige tu camino):',
    stories_completed: '¡Felicitaciones! Has completado la historia',
    stories_re_read: 'Releer con otras decisiones',
    stories_more_btn: 'Ver más historias',
    stories_all_levels: 'Todos los niveles',

    // Roleplay / Quests
    quests_title: 'Misiones Situacionales de Conversación',
    quests_sub: 'Practica español real en situaciones cotidianas con personajes interactivos.',
    quests_tab_roleplay: '🎭 Misiones & Roleplay',
    quests_tab_tutor: '🤖 Tutor Libre',
    quests_objectives: 'Objetivos de la misión',
    quests_feedback_title: 'Consejos y Correcciones en Vivo:',
    quests_hint_title: 'Ideas de respuesta:',
    quests_completed_badge: '¡Misión Completada!',

    // Curriculum & Map
    map_tab_adventure: '🗺️ Mapa de Aventuras A1 con Mateo',
    map_tab_full_list: '📋 Lista Completa A1–C2',
    map_mateo_guide: 'Mateo te aconseja: tu próximo tema',
    map_open_theory: 'Ver Teoría',
    map_mark_mastered: 'Marcar como Dominado',
    map_mark_unmastered: 'Marcar en progreso',
    map_a1_mastery: 'Dominio del Nivel A1',

    // General
    btn_listen: 'Escuchar',
    btn_save_word: '+ Guardar palabra',
    btn_saved_word: '✓ ¡Guardado!',
    btn_check: 'Comprobar respuesta',
    btn_next: 'Siguiente',
    btn_retry: 'Intentar de nuevo',
    status_mastered: 'Dominado',
    status_in_progress: 'En progreso',
    status_not_started: 'No iniciado'
  }
};

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    return localStorage.getItem('lingua_ui_lang') || 'ru';
  });

  const setLanguage = (lang) => {
    if (['ru', 'en', 'es'].includes(lang)) {
      setLanguageState(lang);
      localStorage.setItem('lingua_ui_lang', lang);
    }
  };

  const t = (key, fallback = '') => {
    const dict = UI_TRANSLATIONS[language] || UI_TRANSLATIONS.ru;
    return dict[key] || fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: 'ru',
      setLanguage: () => {},
      t: (key, fallback) => fallback || key
    };
  }
  return context;
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  const options = [
    { code: 'ru', label: 'RU', flag: '🇷🇺' },
    { code: 'en', label: 'EN', flag: '🇬🇧' },
    { code: 'es', label: 'ES', flag: '🇪🇸' },
  ];

  return (
    <div className="flex items-center space-x-1 bg-white/70 dark:bg-gray-800/70 p-1 rounded-xl border border-purple-200 dark:border-gray-700 shadow-sm">
      {options.map((opt) => (
        <button
          key={opt.code}
          onClick={() => setLanguage(opt.code)}
          className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
            language === opt.code
              ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm scale-105'
              : 'text-gray-600 dark:text-gray-400 hover:text-purple-600'
          }`}
          title={`Interface language: ${opt.label}`}
        >
          <span>{opt.flag}</span>
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
