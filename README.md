🇬🇧 [English](#-english) | 🇷🇺 [Русский](#-русский)

---

# 🇬🇧 English

<div align="center">

# 🌍 LinguaLearn

### AI-Powered Language Learning Assistant

**Master English & Spanish with your personal AI tutor**

[![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Google Gemini](https://img.shields.io/badge/Google-Gemini_AI-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

<br/>

🟡🟢 **English** — warm yellow-lime theme &nbsp;•&nbsp; 🩷💜 **Spanish** — vibrant pink-purple theme

---

</div>

## ✨ What is LinguaLearn?

LinguaLearn is a full-stack web application that acts as your personal AI language tutor. Powered by **Google Gemini**, it provides:

- 🤖 **Natural conversations** with an AI tutor that adapts to your level
- 📊 **Smart progress tracking** that automatically detects your weak areas
- 🎯 **Personalized exercises** generated based on your mistakes
- 🎴 **Spaced repetition vocabulary** system (like Anki, but smarter)
- 🗺️ **Full CEFR curriculum** with 150 topics from A1 to C2
- 🌓 **Dark/Light mode** with beautiful glassmorphism UI

> Two independent apps in one repo — learn English, Spanish, or both!

---

## 🎓 Features

<table>
<tr>
<td width="50%">

### 💬 AI Chat Tutor
Chat naturally with your AI tutor. It corrects mistakes, explains grammar, suggests vocabulary, and alternates between conversation, exercises, and resource recommendations.

### 📝 Interactive Exercises
Three exercise types with instant feedback:
- **Multiple Choice** — pick from 4 options
- **Fill in the Blank** — complete sentences
- **Open Questions** — free-form answers checked by AI

### 🎴 Vocabulary (Spaced Repetition)
- Flip cards with translations
- Smart scheduling: Don't Know → today, Hard → 1 day, Good → exponential growth, Easy → accelerated
- Add words manually or auto-collect from chat

### 🎧 Sync Reader
- Load any text + audio pair for intensive reading practice
- One-click HPMOR chapter import from the official text mirror
- Import optional timings from JSON / SRT / VTT
- Start with rough sync, then refine it with manual anchors
- Great for HPMOR-style chapter drilling, shadowing, and listening-reading

</td>
<td width="50%">

### 🗺️ CEFR Curriculum Map
150 topics organized by CEFR levels (A1→C2):
- Track mastery per topic
- Filter by level, status, progress
- Sort by weakest/strongest areas

### 📈 Progress Tracking
- Automatic topic detection from conversations
- Score system: +5 for correct, −10 for mistakes
- Visual progress charts per topic
- Focus on what matters most

### ⚙️ Smart Settings
- Set your current CEFR level
- AI adapts content to your level
- Topics above your level are filtered out

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
LinguaLearn/
├── english/                    # 🇬🇧 English Learning Assistant
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat.jsx        # AI chat with exercise widgets
│   │   │   ├── CurriculumMap.jsx  # CEFR topic navigator
│   │   │   ├── Exercises.jsx   # Structured practice
│   │   │   ├── SyncReader.jsx  # Text + audio reader with sync controls
│   │   │   ├── Vocabulary.jsx  # Spaced repetition cards
│   │   │   ├── Topics.jsx      # Progress dashboard
│   │   │   └── Settings.jsx    # User preferences
│   │   ├── contexts/           # React context (theme)
│   │   ├── hooks/              # Custom React hooks
│   │   ├── utils/              # Sync-reader parsing and IndexedDB storage
│   │   ├── App.jsx             # Main app + routing
│   │   └── index.css           # Tailwind + custom styles
│   ├── server/
│   │   ├── hpmor.js            # HPMOR import + chapter parsing helpers
│   │   └── index.js            # Express API + Gemini + SQLite
│   ├── package.json
│   └── vite.config.js
│
├── spanish/                    # 🇪🇸 Spanish Learning Assistant
│   ├── src/                    # Same structure, different theme
│   ├── server/
│   ├── package.json
│   └── vite.config.js
│
├── .env.example                # API key template
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ 
- **Google Gemini API key** — [get one free](https://makersuite.google.com/app/apikey)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/DoroninDobroCorp/LinguaLearn.git
cd LinguaLearn

# 2. Choose your language (or set up both!)

# --- English ---
cd english
npm install
cp ../.env.example .env
# Edit .env and add your GEMINI_API_KEY
npm run dev
# → Open http://localhost:5173

# --- Spanish ---
cd ../spanish
npm install
cp ../.env.example .env
# Edit .env and add your GEMINI_API_KEY
npm run dev
# → Open http://localhost:5173
```

> 💡 **Run both simultaneously:** English runs on port 3001, Spanish on port 3003. Just open two terminals!

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite | Fast SPA with hot reload |
| **Styling** | TailwindCSS + Glassmorphism | Modern, responsive UI |
| **Animation** | Framer Motion | Smooth transitions |
| **Charts** | Chart.js + react-chartjs-2 | Progress visualization |
| **Icons** | Lucide React | Beautiful icon system |
| **Backend** | Node.js + Express | REST API server |
| **Database** | SQLite (better-sqlite3) | Zero-config local storage |
| **AI** | Google Gemini API | Natural language processing |
| **Routing** | React Router v6 | Client-side navigation |
| **State** | TanStack React Query | Server state management |

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send message to AI tutor |
| `GET` | `/api/topics` | Get all tracked topics |
| `POST` | `/api/topics/update` | Update topic progress |
| `DELETE` | `/api/topics/:id` | Remove a topic |
| `GET` | `/api/settings` | Get user settings |
| `POST` | `/api/settings` | Update settings |
| `DELETE` | `/api/chat/clear` | Clear chat history |
| `GET` | `/api/vocabulary` | Get vocabulary cards |
| `POST` | `/api/vocabulary` | Add new word |
| `PUT` | `/api/vocabulary/:id/review` | Record review result |
| `DELETE` | `/api/vocabulary/:id` | Delete word |
| `GET` | `/api/reader/hpmor/chapter/:chapterNumber` | Import an HPMOR chapter with estimated audiobook window |

---

## 🎨 Themes

Each language app has its own unique color palette:

| | English 🇬🇧 | Spanish 🇪🇸 |
|---|---|---|
| **Primary** | 🟡 Yellow (`#fbbf24`) | 🩷 Fuchsia (`#e879f9`) |
| **Secondary** | 🟢 Lime (`#a3e635`) | 💜 Purple (`#c084fc`) |
| **Gradient** | Yellow → Lime | Pink → Purple |
| **Vibe** | Sunny & Fresh | Warm & Passionate |

Both apps support **Light** ☀️ and **Dark** 🌙 modes with smooth transitions.

---

## 📖 How the Learning System Works

```
┌─────────────────────────────────────────────────────┐
│                  User chats with AI                  │
│                        ↓                             │
│            AI detects grammar/vocab errors            │
│                        ↓                             │
│         Topics created automatically in DB            │
│              ↓                    ↓                   │
│      Correct usage: +5      Mistake: −10             │
│              ↓                    ↓                   │
│         Topics ranked by weakness                     │
│                        ↓                             │
│     AI generates targeted exercises & content         │
│                        ↓                             │
│            User improves, scores go up!               │
└─────────────────────────────────────────────────────┘
```

### Spaced Repetition Schedule

| Rating | Interval Progression |
|--------|---------------------|
| ❌ Don't Know | Repeat today |
| 🟠 Hard | 1 day |
| 🔵 Good | 1 → 3 → 7 → 14 → 30 → 60 days |
| ✅ Easy | 3 → 7 → 14 → 30 → 60 → 90 days |

---

## 🧪 Testing

Both apps include Playwright E2E tests:

```bash
cd english  # or spanish
npx playwright install
npx playwright test
```

---

## 🤝 Contributing

Contributions are welcome! Here are some ideas:

- 🌐 **Add a new language** — fork the English app, change the prompts and theme
- 🎨 **New themes** — create additional color schemes
- 📱 **Mobile app** — React Native port
- 🔊 **Speech recognition** — add pronunciation practice
- 👥 **Multi-user** — add authentication and user profiles

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ and AI**

⭐ Star this repo if you find it useful!

[Report Bug](https://github.com/DoroninDobroCorp/LinguaLearn/issues) · [Request Feature](https://github.com/DoroninDobroCorp/LinguaLearn/issues)

</div>

---

# 🇷🇺 Русский

<div align="center">

# 🌍 LinguaLearn

### Языковой помощник на базе ИИ

**Осваивайте английский и испанский с персональным ИИ-репетитором**

[![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Google Gemini](https://img.shields.io/badge/Google-Gemini_AI-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

<br/>

🟡🟢 **English** — тёплая жёлто-лаймовая тема &nbsp;•&nbsp; 🩷💜 **Spanish** — яркая розово-фиолетовая тема

---

</div>

## ✨ Что такое LinguaLearn?

LinguaLearn — это полноценное веб-приложение, которое выступает в роли вашего персонального ИИ-репетитора по иностранным языкам. На базе **Google Gemini** оно предоставляет:

- 🤖 **Живые диалоги** с ИИ-репетитором, который подстраивается под ваш уровень
- 📊 **Умное отслеживание прогресса** с автоматическим выявлением слабых мест
- 🎯 **Персонализированные упражнения**, сгенерированные на основе ваших ошибок
- 🎴 **Словарь с интервальным повторением** (как Anki, только умнее)
- 🗺️ **Полная программа CEFR** — 150 тем от A1 до C2
- 🌓 **Тёмная/Светлая тема** с красивым glassmorphism-интерфейсом

> Два независимых приложения в одном репозитории — учите английский, испанский или оба сразу!

---

## 🎓 Возможности

<table>
<tr>
<td width="50%">

### 💬 ИИ-чат с репетитором
Общайтесь с ИИ-репетитором в естественной форме. Он исправляет ошибки, объясняет грамматику, предлагает новую лексику и чередует диалоги, упражнения и рекомендации ресурсов.

### 📝 Интерактивные упражнения
Три типа заданий с мгновенной обратной связью:
- **Выбор из вариантов** — выберите из 4 ответов
- **Заполните пропуск** — дополните предложение
- **Открытые вопросы** — свободные ответы, проверяемые ИИ

### 🎴 Словарь (интервальное повторение)
- Карточки с переводом (переворачиваются)
- Умное расписание: Не знаю → сегодня, Трудно → 1 день, Хорошо → экспоненциальный рост, Легко → ускоренный
- Добавляйте слова вручную или собирайте автоматически из чата

</td>
<td width="50%">

### 🗺️ Карта программы CEFR
150 тем, организованных по уровням CEFR (A1→C2):
- Отслеживайте освоение каждой темы
- Фильтруйте по уровню, статусу, прогрессу
- Сортируйте по самым слабым/сильным сторонам

### 📈 Отслеживание прогресса
- Автоматическое определение тем из диалогов
- Система баллов: +5 за правильный ответ, −10 за ошибку
- Наглядные графики прогресса по каждой теме
- Фокус на том, что действительно важно

### ⚙️ Умные настройки
- Укажите ваш текущий уровень CEFR
- ИИ адаптирует контент под ваш уровень
- Темы выше вашего уровня автоматически скрываются

</td>
</tr>
</table>

---

## 🏗️ Архитектура

```
LinguaLearn/
├── english/                    # 🇬�� Помощник для изучения английского
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat.jsx        # ИИ-чат с виджетами упражнений
│   │   │   ├── CurriculumMap.jsx  # Навигатор тем CEFR
│   │   │   ├── Exercises.jsx   # Структурированная практика
│   │   │   ├── Vocabulary.jsx  # Карточки интервального повторения
│   │   │   ├── Topics.jsx      # Панель прогресса
│   │   │   └── Settings.jsx    # Настройки пользователя
│   │   ├── contexts/           # React context (тема)
│   │   ├── hooks/              # Пользовательские React hooks
│   │   ├── App.jsx             # Главное приложение + маршрутизация
│   │   └── index.css           # Tailwind + пользовательские стили
│   ├── server/
│   │   └── index.js            # Express API + Gemini + SQLite
│   ├── package.json
│   └── vite.config.js
│
├── spanish/                    # 🇪🇸 Помощник для изучения испанского
│   ├── src/                    # Та же структура, другая тема
│   ├── server/
│   ├── package.json
│   └── vite.config.js
│
├── .env.example                # Шаблон API-ключа
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🚀 Быстрый старт

### Требования

- **Node.js** 18+ 
- **Ключ API Google Gemini** — [получите бесплатно](https://makersuite.google.com/app/apikey)

### Установка

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/DoroninDobroCorp/LinguaLearn.git
cd LinguaLearn

# 2. Выберите язык (или настройте оба!)

# --- Английский ---
cd english
npm install
cp ../.env.example .env
# Отредактируйте .env и добавьте ваш GEMINI_API_KEY
npm run dev
# → Откройте http://localhost:5173

# --- Испанский ---
cd ../spanish
npm install
cp ../.env.example .env
# Отредактируйте .env и добавьте ваш GEMINI_API_KEY
npm run dev
# → Откройте http://localhost:5173
```

> 💡 **Запуск обоих одновременно:** English работает на порту 3001, Spanish — на порту 3003. Просто откройте два терминала!

---

## 🛠️ Технологический стек

| Слой | Технология | Назначение |
|------|-----------|------------|
| **Фронтенд** | React 18 + Vite | Быстрое SPA с горячей перезагрузкой |
| **Стили** | TailwindCSS + Glassmorphism | Современный адаптивный интерфейс |
| **Анимации** | Framer Motion | Плавные переходы |
| **Графики** | Chart.js + react-chartjs-2 | Визуализация прогресса |
| **Иконки** | Lucide React | Красивая система иконок |
| **Бэкенд** | Node.js + Express | REST API сервер |
| **База данных** | SQLite (better-sqlite3) | Локальное хранилище без настройки |
| **ИИ** | Google Gemini API | Обработка естественного языка |
| **Маршрутизация** | React Router v6 | Клиентская навигация |
| **Состояние** | TanStack React Query | Управление серверным состоянием |

---

## 📡 API-эндпоинты

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| `POST` | `/api/chat` | Отправить сообщение ИИ-репетитору |
| `GET` | `/api/topics` | Получить все отслеживаемые темы |
| `POST` | `/api/topics/update` | Обновить прогресс по теме |
| `DELETE` | `/api/topics/:id` | Удалить тему |
| `GET` | `/api/settings` | Получить настройки пользователя |
| `POST` | `/api/settings` | Обновить настройки |
| `DELETE` | `/api/chat/clear` | Очистить историю чата |
| `GET` | `/api/vocabulary` | Получить словарные карточки |
| `POST` | `/api/vocabulary` | Добавить новое слово |
| `PUT` | `/api/vocabulary/:id/review` | Записать результат повторения |
| `DELETE` | `/api/vocabulary/:id` | Удалить слово |

---

## 🎨 Темы оформления

У каждого языкового приложения своя уникальная цветовая палитра:

| | English 🇬🇧 | Spanish 🇪🇸 |
|---|---|---|
| **Основной** | 🟡 Жёлтый (`#fbbf24`) | 🩷 Фуксия (`#e879f9`) |
| **Дополнительный** | 🟢 Лайм (`#a3e635`) | 💜 Фиолетовый (`#c084fc`) |
| **Градиент** | Жёлтый → Лайм | Розовый → Фиолетовый |
| **Настроение** | Солнечный и свежий | Тёплый и страстный |

Оба приложения поддерживают **Светлый** ☀️ и **Тёмный** 🌙 режимы с плавными переходами.

---

## 📖 Как работает система обучения

```
┌─────────────────────────────────────────────────────┐
│           Пользователь общается с ИИ                 │
│                        ↓                             │
│     ИИ обнаруживает грамматические/лексические       │
│                    ошибки                             │
│                        ↓                             │
│        Темы автоматически создаются в БД              │
│              ↓                    ↓                   │
│    Правильный ответ: +5    Ошибка: −10               │
│              ↓                    ↓                   │
│      Темы ранжируются по слабым местам                │
│                        ↓                             │
│    ИИ генерирует целевые упражнения и контент         │
│                        ↓                             │
│     Пользователь прогрессирует, баллы растут!         │
└─────────────────────────────────────────────────────┘
```

### Расписание интервального повторения

| Оценка | Прогрессия интервалов |
|--------|----------------------|
| ❌ Не знаю | Повторить сегодня |
| 🟠 Трудно | 1 день |
| 🔵 Хорошо | 1 → 3 → 7 → 14 → 30 → 60 дней |
| ✅ Легко | 3 → 7 → 14 → 30 → 60 → 90 дней |

---

## 🧪 Тестирование

Оба приложения включают E2E-тесты на Playwright:

```bash
cd english  # или spanish
npx playwright install
npx playwright test
```

---

## 🤝 Участие в проекте

Мы рады вашему участию! Вот несколько идей:

- 🌐 **Добавить новый язык** — форкните English-приложение, измените промпты и тему
- 🎨 **Новые темы оформления** — создайте дополнительные цветовые схемы
- 📱 **Мобильное приложение** — портирование на React Native
- 🔊 **Распознавание речи** — добавьте практику произношения
- 👥 **Многопользовательский режим** — добавьте аутентификацию и профили

---

## 📜 Лицензия

Проект распространяется под лицензией **MIT** — подробности в файле [LICENSE](LICENSE).

---

<div align="center">

**Сделано с ❤️ и ИИ**

⭐ Поставьте звезду, если проект оказался полезным!

[Сообщить об ошибке](https://github.com/DoroninDobroCorp/LinguaLearn/issues) · [Предложить идею](https://github.com/DoroninDobroCorp/LinguaLearn/issues)

</div>
