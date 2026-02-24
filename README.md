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
│   │   │   ├── Vocabulary.jsx  # Spaced repetition cards
│   │   │   ├── Topics.jsx      # Progress dashboard
│   │   │   └── Settings.jsx    # User preferences
│   │   ├── contexts/           # React context (theme)
│   │   ├── hooks/              # Custom React hooks
│   │   ├── App.jsx             # Main app + routing
│   │   └── index.css           # Tailwind + custom styles
│   ├── server/
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
