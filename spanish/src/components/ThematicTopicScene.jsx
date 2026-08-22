import React from 'react';

// Thematic SVG & visual props for all 30 A1 topics
const TOPIC_SCENE_MAP = {
  1: {
    title: "Ser vs Estar",
    emoji: "⚖️",
    accent: "from-amber-400 via-orange-400 to-rose-500",
    bgPattern: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    mascotPose: "holding_scales",
    props: ["🛂 SER: Суть / Паспорт", "📍 ESTAR: Состояние / Где"]
  },
  2: {
    title: "Глаголы -AR",
    emoji: "🗣️",
    accent: "from-fuchsia-500 via-purple-500 to-indigo-500",
    bgPattern: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
    mascotPose: "writing_desk",
    props: ["✍️ yo habl-o", "💬 tú habl-as"]
  },
  3: {
    title: "Глаголы -ER / -IR",
    emoji: "🍽️",
    accent: "from-emerald-400 via-teal-500 to-cyan-500",
    bgPattern: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800",
    mascotPose: "cafe_table",
    props: ["🥟 com-er", "📝 escrib-ir"]
  },
  4: {
    title: "Род и артикли",
    emoji: "🏷️",
    accent: "from-sky-400 via-blue-500 to-indigo-500",
    bgPattern: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
    mascotPose: "sorting_chests",
    props: ["🔵 el libro (муж.)", "🔴 la mesa (жен.)"]
  },
  5: {
    title: "Неопределенные артикли",
    emoji: "📦",
    accent: "from-amber-400 via-yellow-500 to-lime-500",
    bgPattern: "bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800",
    mascotPose: "gift_box",
    props: ["🎁 un café", "🍎 una manzana"]
  },
  6: {
    title: "Множественное число",
    emoji: "👥",
    accent: "from-violet-400 via-purple-500 to-pink-500",
    bgPattern: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
    mascotPose: "friends_group",
    props: ["🦫 amigo ➔ amigos", "🏙️ ciudad ➔ ciudades"]
  },
  7: {
    title: "Местоимения (Yo / Tú / Vos)",
    emoji: "👤",
    accent: "from-rose-400 via-pink-500 to-purple-500",
    bgPattern: "bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-800",
    mascotPose: "pointing",
    props: ["👉 Yo (я)", "👉 Tú / Vos (ты)"]
  },
  8: {
    title: "Притяжательные (Mi / Tu / Su)",
    emoji: "🎒",
    accent: "from-emerald-400 via-teal-500 to-blue-500",
    bgPattern: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    mascotPose: "holding_bag",
    props: ["🎒 mi mochila", "🧉 tu mate"]
  },
  9: {
    title: "Указатели (Este / Ese / Aquel)",
    emoji: "👉",
    accent: "from-cyan-400 via-sky-500 to-indigo-500",
    bgPattern: "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800",
    mascotPose: "distance_pointing",
    props: ["📍 este (здесь)", "🔭 aquel (вон там)"]
  },
  10: {
    title: "Конструкция Hay vs Estar",
    emoji: "📍",
    accent: "from-amber-400 via-orange-500 to-red-500",
    bgPattern: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",
    mascotPose: "searchlight",
    props: ["🏢 Hay un hotel", "📍 El hotel está aquí"]
  },
  11: {
    title: "Глагол Tener",
    emoji: "⚡",
    accent: "from-red-400 via-rose-500 to-amber-500",
    bgPattern: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800",
    mascotPose: "thermometer_cake",
    props: ["🎂 tener 25 años", "🥶 tener frío"]
  },
  12: {
    title: "Глагол Gustar",
    emoji: "❤️",
    accent: "from-rose-400 via-pink-500 to-fuchsia-500",
    bgPattern: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800",
    mascotPose: "hugging_mate",
    props: ["💖 Me gusta el mate", "🎶 Me encantan las canciones"]
  },
  13: {
    title: "Согласование прилагательных",
    emoji: "🧩",
    accent: "from-lime-400 via-emerald-500 to-teal-500",
    bgPattern: "bg-lime-50 dark:bg-lime-950/40 border-lime-200 dark:border-lime-800",
    mascotPose: "color_puzzles",
    props: ["👕 chico alto", "👗 chica alta"]
  },
  14: {
    title: "Числительные (0–1000)",
    emoji: "💯",
    accent: "from-amber-400 via-yellow-500 to-orange-500",
    bgPattern: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    mascotPose: "coins_abacus",
    props: ["🪙 cien (100)", "🏆 mil (1000)"]
  },
  15: {
    title: "Предлоги места",
    emoji: "🧭",
    accent: "from-teal-400 via-cyan-500 to-blue-500",
    bgPattern: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800",
    mascotPose: "spatial_box",
    props: ["📦 sobre la mesa", "🪑 debajo de la silla"]
  },
  16: {
    title: "Неправильные глаголы (Ir/Hacer/Decir)",
    emoji: "⚡",
    accent: "from-purple-500 via-indigo-500 to-blue-500",
    bgPattern: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
    mascotPose: "superhero",
    props: ["🚀 voy (я иду)", "🛠️ hago (я делаю)"]
  },
  17: {
    title: "Отрицание (No + глагол)",
    emoji: "⛔",
    accent: "from-red-400 via-rose-500 to-orange-500",
    bgPattern: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
    mascotPose: "shield_stop",
    props: ["🛑 No hablo rápido", "❌ No tengo tiempo"]
  },
  18: {
    title: "Вопросы (¿...?)",
    emoji: "❓",
    accent: "from-indigo-400 via-purple-500 to-pink-500",
    bgPattern: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800",
    mascotPose: "detective",
    props: ["🔍 ¿Dónde? (Где?)", "❓ ¿Cuándo? (Когда?)"]
  },
  19: {
    title: "Числа от 0 до 20",
    emoji: "🔢",
    accent: "from-emerald-400 via-teal-500 to-cyan-500",
    bgPattern: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    mascotPose: "counting_fingers",
    props: ["1️⃣ uno, dos, tres", "🔟 diez, veinte"]
  },
  20: {
    title: "Цвета (Colores)",
    emoji: "🎨",
    accent: "from-pink-500 via-purple-500 to-cyan-400",
    bgPattern: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
    mascotPose: "artist_palette",
    props: ["🔴 rojo, azul, verde", "🎨 amarillo, blanco"]
  },
  21: {
    title: "Семья (La Familia)",
    emoji: "👨‍👩‍👧‍👦",
    accent: "from-amber-400 via-orange-400 to-rose-400",
    bgPattern: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",
    mascotPose: "family_portrait",
    props: ["👴 abuelo y abuela", "👨‍👩‍👧 padre, madre, hijo"]
  },
  22: {
    title: "Дни недели и времена года",
    emoji: "📅",
    accent: "from-sky-400 via-teal-400 to-emerald-500",
    bgPattern: "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800",
    mascotPose: "calendar_seasons",
    props: ["☀️ verano / otoño", "❄️ invierno / primavera"]
  },
  23: {
    title: "Еда и напитки",
    emoji: "☕",
    accent: "from-orange-400 via-amber-500 to-yellow-500",
    bgPattern: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    mascotPose: "chef_tapas",
    props: ["🥘 la paella y tapas", "☕ café con leche"]
  },
  24: {
    title: "Одежда и покупки",
    emoji: "👗",
    accent: "from-fuchsia-400 via-pink-500 to-rose-500",
    bgPattern: "bg-fuchsia-50 dark:bg-fuchsia-950/40 border-fuchsia-200 dark:border-fuchsia-800",
    mascotPose: "fashion_boutique",
    props: ["🧥 abrigo y camisa", "🕶️ gafas de sol"]
  },
  25: {
    title: "Части тела и Doler",
    emoji: "🫀",
    accent: "from-rose-400 via-red-500 to-orange-500",
    bgPattern: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800",
    mascotPose: "anatomy_heart",
    props: ["🧠 la cabeza", "❤️ me duele el corazón"]
  },
  26: {
    title: "Дом и мебель",
    emoji: "🏠",
    accent: "from-amber-400 via-emerald-500 to-teal-500",
    bgPattern: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    mascotPose: "cozy_living_room",
    props: ["🛋️ el sofá y mesa", "🛏️ la habitación"]
  },
  27: {
    title: "Приветствия и знакомство (Saludos)",
    emoji: "🤝",
    accent: "from-fuchsia-500 via-purple-600 to-indigo-600",
    bgPattern: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
    mascotPose: "plaza_greeting",
    props: ["¡Hola! ¿Cómo estás?", "¡Mucho gusto!"]
  },
  28: {
    title: "Который час (La Hora)",
    emoji: "⏰",
    accent: "from-cyan-400 via-sky-500 to-blue-600",
    bgPattern: "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800",
    mascotPose: "clock_tower",
    props: ["🕐 Son las tres", "⏰ Es la una y media"]
  },
  29: {
    title: "Заказ еды в ресторане",
    emoji: "📝",
    accent: "from-amber-400 via-orange-500 to-rose-500",
    bgPattern: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",
    mascotPose: "ordering_waiter",
    props: ["🍽️ La cuenta, por favor", "🥤 Para mí, un agua"]
  },
  30: {
    title: "Описание людей (Внешность и характер)",
    emoji: "🧑‍🤝‍🧑",
    accent: "from-emerald-400 via-teal-500 to-indigo-500",
    bgPattern: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800",
    mascotPose: "portrait_sketch",
    props: ["🧑 es simpático", "👀 tiene ojos verdes"]
  }
};

export default function ThematicTopicScene({
  topicId = 27,
  topicTitle = '',
  size = 'hero', // 'hero' | 'compact' | 'mini'
  className = ''
}) {
  const scene = TOPIC_SCENE_MAP[Number(topicId)] || TOPIC_SCENE_MAP[27];

  if (size === 'mini') {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 text-xs font-bold ${className}`}>
        <span>{scene.emoji}</span>
        <span>{scene.title}</span>
      </div>
    );
  }

  if (size === 'compact') {
    return (
      <div className={`p-3 rounded-2xl ${scene.bgPattern} border flex items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-xl flex-shrink-0">
            {scene.emoji}
          </div>
          <div>
            <div className="text-xs font-black text-gray-900 dark:text-white">
              {topicTitle || scene.title}
            </div>
            <div className="flex gap-2 mt-0.5">
              {scene.props.map((p, idx) => (
                <span key={idx} className="text-[11px] text-gray-600 dark:text-gray-300 font-medium">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // FULL HERO BANNER SCENE
  return (
    <div className={`p-6 sm:p-7 rounded-3xl ${scene.bgPattern} border-2 relative overflow-hidden shadow-lg ${className}`}>
      {/* Decorative ambient gradient circle */}
      <div className={`absolute -right-12 -bottom-12 w-44 h-44 rounded-full bg-gradient-to-br ${scene.accent} opacity-20 blur-2xl pointer-events-none`} />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
        {/* Left text info */}
        <div className="space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-sm text-xs font-black text-gray-800 dark:text-gray-100">
            <span className="text-base">{scene.emoji}</span>
            <span>Тематический гид курса A1</span>
          </div>

          <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            {topicTitle || scene.title}
          </h3>

          {/* Context badges */}
          <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
            {scene.props.map((propText, pIdx) => (
              <span
                key={pIdx}
                className="px-3 py-1.5 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-purple-100 dark:border-gray-700 text-xs font-bold text-gray-700 dark:text-gray-200 shadow-sm"
              >
                {propText}
              </span>
            ))}
          </div>
        </div>

        {/* Right Mascot Hero Illustration */}
        <div className="flex-shrink-0 relative">
          {/* Animated Mascot Frame */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br from-amber-200 via-orange-300 to-amber-400 dark:from-amber-700 dark:via-orange-800 dark:to-amber-900 border-2 border-amber-400 dark:border-amber-600 shadow-xl flex items-center justify-center relative overflow-hidden transform hover:scale-105 transition-all">
            {/* Custom SVG Capybara face */}
            <svg viewBox="0 0 100 100" className="w-[85%] h-[85%] drop-shadow-md">
              {/* Boina */}
              <path d="M 25 35 Q 50 15 75 35 Q 85 45 65 42 Q 50 40 35 42 Z" fill="#4f46e5" stroke="#3730a3" strokeWidth="2" />
              <circle cx="50" cy="22" r="3.5" fill="#facc15" />

              {/* Head */}
              <rect x="25" y="38" width="50" height="42" rx="18" fill="#b45309" />
              {/* Snout */}
              <rect x="32" y="52" width="36" height="25" rx="10" fill="#d97706" />

              {/* Ears */}
              <circle cx="28" cy="38" r="7" fill="#92400e" />
              <circle cx="28" cy="38" r="4" fill="#fcd34d" />
              <circle cx="72" cy="38" r="7" fill="#92400e" />
              <circle cx="72" cy="38" r="4" fill="#fcd34d" />

              {/* Eyes */}
              <ellipse cx="38" cy="48" rx="3.5" ry="4" fill="#1e293b" />
              <circle cx="37" cy="46.5" r="1.2" fill="#ffffff" />
              <ellipse cx="62" cy="48" rx="3.5" ry="4" fill="#1e293b" />
              <circle cx="61" cy="46.5" r="1.2" fill="#ffffff" />

              {/* Nose */}
              <ellipse cx="50" cy="58" rx="6" ry="4" fill="#451a03" />

              {/* Mouth */}
              <path d="M 46 64 Q 50 67 54 64" fill="none" stroke="#451a03" strokeWidth="2" strokeLinecap="round" />

              {/* Cheeks */}
              <circle cx="34" cy="56" r="3.5" fill="#f87171" opacity="0.6" />
              <circle cx="66" cy="56" r="3.5" fill="#f87171" opacity="0.6" />
            </svg>

            {/* Corner emoji badge */}
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white dark:bg-gray-800 rounded-full border-2 border-purple-200 dark:border-gray-600 flex items-center justify-center text-sm shadow-md">
              {scene.emoji}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
