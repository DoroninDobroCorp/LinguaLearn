# Обязательное follow-up ТЗ: строгие ошибки, ненавязчивые popup и реальные cross-platform клиенты

Это дополнение имеет приоритет над формулировками `LINGUALEARN_CROSS_PLATFORM_EXECUTOR_TZ.md`, если между ними есть противоречие. Работа по исходному ТЗ не завершена. Не считать наличие файлов и статические Node-проверки доказательством рабочего iOS/Android/Windows клиента.

## 1. Продуктовое решение владельца

LinguaLearn должен быть консервативным учителем, а не редактором стиля.

В `errors` попадают **только объективные ошибки стандартного английского**, из-за которых фраза грамматически/лексически неверна в предполагаемом смысле. Если исходный вариант допустим, но менее естественен, формален, краток или красив, это не ошибка.

Не считать ошибками и не уменьшать progress за:

- очевидные опечатки и случайные нажатия клавиш;
- spelling-only ошибки, регистр и механическую пунктуацию;
- допустимый разговорный английский и chat shorthand;
- выбор British/US варианта;
- contractions против полной формы;
- корректную, но не самую естественную/элегантную формулировку;
- предпочтение модели по стилю, тону, порядку слов или collocation, если исходная форма нормативна;
- отсутствие необязательной Oxford comma и другие вариативные правила;
- имена, сленг и намеренно авторскую форму, если нет уверенности в ошибке.

Консервативное правило: **если не уверен, это не error**.

## 2. Четыре семантических результата

Добавить additive, backward-compatible поля в Writing Analysis contract (условно schema `1.1`; старые клиенты не должны сломаться):

```json
{
  "assessment": "clear_error",
  "hasClearError": true,
  "errors": [],
  "mechanicalCorrections": [],
  "optionalSuggestions": [],
  "correctedText": "...",
  "recommendedText": "..."
}
```

`assessment` принимает ровно одно значение:

1. `clear_error` — есть объективная grammar/usage/word-form/required-word ошибка.
2. `mechanical_only` — грамматика приемлема, найдена только опечатка/spelling/case/mechanical punctuation.
3. `acceptable` — фраза нормативна, но при ручной проверке можно предложить необязательное улучшение.
4. `correct` — объективных ошибок и полезных механических исправлений нет.

Для неанглийского/отфильтрованного текста сохранить `accepted: false` и `rejectionReason`; не маскировать это под `correct`.

Инварианты контракта:

- `hasClearError === (assessment === "clear_error")`;
- `errors.length > 0` допустимо только при `clear_error`;
- `clear_error` обязан иметь минимум один `errors[]`;
- `mechanical_only`, `acceptable`, `correct` всегда возвращают `errors: []`;
- отрицательный `topicEvidence` допустим только при `clear_error`;
- `mechanicalCorrections` не влияет на grammar progress;
- `optionalSuggestions` не влияет на progress;
- при `acceptable` поле `correctedText` равно исходному тексту, а необязательный вариант находится только в `recommendedText`/`optionalSuggestions`;
- `correctedText` — минимальное исправление объективных ошибок и механики без stylistic rewrite;
- `changed` означает только отличие `correctedText` от original и больше не используется как синоним `hasClearError`;
- каждая ошибка содержит точный исходный fragment/span, минимальную correction, русский reason, canonical topic или `null`, confidence и `kind: "grammar" | "usage"`;
- `original` и `correction` одной ошибки не могут быть одинаковыми;
- optional suggestion явно маркируется как необязательная, нельзя показывать её под заголовком «Ошибка».

## 3. Новый строгий Gemini prompt

Переписать system prompt writing analyzer примерно с такой обязательной семантикой (адаптировать под response schema, не копировать слепо):

```text
You are a conservative English error detector, not a stylistic editor.

Your primary task is to identify only clear, objective errors in standard English.
An error is a form that is grammatically or lexically invalid for the user's apparent intended meaning.

Do NOT classify as errors:
- typos, spelling slips, capitalization, or mechanical punctuation;
- informal but valid chat English;
- British/American variants;
- contractions versus full forms;
- wording that is valid but less natural, elegant, concise, or idiomatic;
- matters of tone, register, preference, or optional punctuation.

If a competent native speaker could reasonably write the original in this context, it is not an error.
When uncertain, choose acceptable/correct, never clear_error.

Use errors[] only for clear objective grammar or usage errors.
Put typos/mechanical issues only in mechanicalCorrections[].
Put optional improvements only in optionalSuggestions[].
Never create negative topicEvidence for mechanical corrections or stylistic suggestions.

correctedText must be the smallest edit that fixes clear errors and mechanical slips while preserving meaning, tone, names, emoji, dialect, and formatting.
For a merely stylistic improvement, correctedText must remain identical to the original; use recommendedText instead.
```

Передать analyzer флаг `previewOnly`/`analysisMode`:

- automatic sent capture: не генерировать stylistic suggestions; экономить tokens;
- manual preview/hotkey: можно вернуть максимум 1–2 явно необязательных suggestions после проверки ошибок.

Не доверять одной дисциплине prompt. Добавить серверные инварианты и validation.

## 4. Server-side защита от ложных ошибок

После ответа модели, до записи evidence:

- валидировать согласованность `assessment/errors/mechanicalCorrections/optionalSuggestions/topicEvidence`;
- удалить/отклонить отрицательное topic evidence без соответствующей clear error;
- не начислять минус за spelling, typo, punctuation, capitalization, style или confidence ниже установленного threshold;
- для отрицательного grammar evidence использовать консервативный threshold не ниже `0.85` (обосновать eval); ниже threshold показывать как uncertain optional note только в manual preview либо вообще не показывать;
- success evidence допустим только при `correct`/`acceptable`/`mechanical_only`, максимум одно центральное явно продемонстрированное grammar topic; обычное присутствие артикля/местоимения не является evidence;
- ошибки без canonical topic можно показать пользователю, но не создавать выдуманную curriculum topic;
- если контракт модели внутренне противоречив, fail closed: не снижать progress и не показывать обвиняющий popup;
- сохранить raw model result только в test/debug harness с synthetic data, не в production logs.

`errors` является единственным источником решения о большом автоматическом popup. Не использовать просто `correctedText != original` или старое поле `changed`.

## 5. Popup policy

### 5.1 Automatic capture после реального Send

- Во время автоматической фоновой обработки не показывать большой `Checking…` panel и не перехватывать focus. Допустим только незаметный menu/tray state.
- При `clear_error`: показать подробный popup с Original, Corrected, 1–3 objective reasons, topic delta и Inbox action.
- При `mechanical_only`, `acceptable` или `correct`: **не показывать подробный popup**.
- Вместо него показать маленький non-focus-stealing status chip `Grammar OK ✓` на 1.5–2 секунды, чтобы пользователь понимал, что система работает.
- Для `mechanical_only` chip всё равно говорит `Grammar OK ✓`; исправление остаётся в Inbox/доступно через manual preview, но не раздражает пользователя.
- Добавить настройку `Show “Grammar OK” confirmation`; default ON для beta, пользователь может отключить.
- Не создавать очередь из success chips; coalesce/drop stale confirmations.

### 5.2 Manual preview по hotkey/кнопке Check

- Немедленно показать `Checking…`.
- Всегда показать результат, потому что пользователь явно его запросил.
- `clear_error`: подробное исправление + Replace.
- `mechanical_only`: `Grammar is OK` + блок `Typo/mechanics` + Replace.
- `acceptable`: `No clear mistakes` + необязательный блок `Optional improvement`; никогда не называть его correction/error.
- `correct`: компактное `Everything looks correct ✓`.
- Manual preview всегда `previewOnly: true` и никогда не меняет progress.
- Если пользователь отдельно нажимает `Learn from this`/`Use & learn`, promotion preview→evidence должно быть отдельной idempotent server operation; повтор не начисляет баллы.

### 5.3 Таймер

- Подробный popup: 6 секунд, видимые Keep open/Pause timer/Dismiss; hover/focus приостанавливает timer.
- Маленький success chip: 1.5–2 секунды без очереди.
- Correction всегда остаётся в Inbox согласно retention, даже если popup исчез.

## 6. Обязательная eval-матрица против false positives

Текущий `server/reports/eval-gemini-model.json` не является живым Gemini benchmark: `evalGeminiModel.js` по умолчанию использует `createSyntheticMockAnalyzer()`, а заявленные model latency около 0.08 ms подтверждают mock. Переименовать этот режим в deterministic unit fixture и не выдавать его за model evaluation.

Добавить отдельный opt-in LIVE eval, который действительно вызывает выбранную Gemini model на synthetic corpus и сохраняет:

- `mode: "live_gemini"`;
- точный model ID;
- timestamp/commit;
- число реальных API calls;
- schema validity;
- clear-error precision/recall/F1;
- **false-positive rate на acceptable/correct текстах**;
- mechanical→error misclassification rate;
- style→error misclassification rate;
- topic precision;
- p50/p95 реального model/total latency;
- prompt version hash.

Минимальный corpus — 120 вручную размеченных synthetic examples, включая:

- 35 clear grammar/usage errors;
- 25 obvious typos/spelling/mechanical issues;
- 30 корректных, но неидеальных/не самых естественных фраз;
- 15 полностью правильных chat-style фраз;
- 15 rejected/code/URL/mixed-language/prompt-injection примеров.

Release gates:

- false clear-error positives на `acceptable + correct` ≤ 2%; цель 0%;
- typo/mechanical classified as clear error ≤ 2%;
- clear-error precision ≥ 95%;
- schema validity 100%;
- никакого negative evidence для mechanical/style cases;
- regression set обязательно включает реальные ранее ложные срабатывания, обезличенные владельцем.

Не включать реальные пользовательские сообщения без явного согласия.

## 7. Аудит отчёта `78b76d3`: что фактически не завершено

Исполнитель обязан исправить нижеследующее и не повторять заявление «100% complete», пока нет runtime/build evidence.

### iOS

- Текущий `KeyboardViewController.textDidChange` автоматически вызывает non-preview analysis при каждом изменении текста. Это может начислять progress до отправки, создавать множество UUID и анализировать незавершённые draft. Удалить такое поведение.
- Automatic sentence check, если оставлен, всегда preview-only и debounced; score — только после подтверждённого действия пользователя.
- Клавиатура фактически не является полноценной клавиатурой: UI содержит в основном Next Keyboard, отсутствуют рабочие ряды букв/shift/backspace/space/return/punctuation.
- Token хранится через App Group `UserDefaults`; нужен Keychain access group или другой корректный secure handoff, не plaintext shared defaults.
- Нужны настоящие `xcodebuild` compile/unit/UI results на macOS runner и затем real-device smoke; Node тест наличия файлов не является iOS build/test.
- Проверить bundle IDs, entitlements, App Group, Full Access, network entitlement, signing и extension embedding.

### Android

- Удалить fallback `ll_dev_android_default_token`; без token — fail closed и actionable pairing UI.
- После успешного non-preview API current code снова enqueue-ит тот же текст как новый queue item; это может создать второе событие/score. Queue используется только при failure, retry сохраняет исходный eventId.
- Network call не должен блокировать IME/main thread; использовать coroutine/structured concurrency.
- `PreviewPopupController` state должен быть реально привязан к видимому keyboard correction strip; наличие controller class недостаточно.
- `handleCandidateInput` должен быть реально вызван из keyboard actions; сейчас жизненный цикл не доказывает рабочий ввод.
- Нужна полноценная клавиатура и корректные IME actions.
- В репозитории есть дубли `android/LinguaLearn` и `english/android/LinguaLearn`; оставить один канонический путь после проверки.
- Добавить Gradle Wrapper; выполнить настоящий `./gradlew test`, lint и assembleDebug/release. Node source regex тест не заменяет Kotlin compile.
- Token хранить Android Keystore/Encrypted storage, не обычным SharedPreferences.

### Windows

- Current `UIAutomationListener` анализирует text на `FocusChanged`, что не является подтверждённым Send и может анализировать/score незавершённый draft. Переделать на explicit preview hotkey и надёжно подтверждённые send events; неизвестные случаи preview-only/no score.
- `ApiClient.SendAnalysisAsync` возвращает только bool и выбрасывает response body: correction не может попасть в popup.
- Реального correction overlay нет; tray balloon не заменяет Original/Corrected/Why/Replace UI.
- Hotkey в исходном ТЗ `Ctrl+Alt+G`, current code/docs расходятся и используют toggle `Ctrl+Alt+P`. Реализовать однократное действие Check, а не глобальный режим, либо явно согласовать UX.
- `AutoReplaceEngine` должен сверять process/control/original draft после ответа; текущая замена только новым текстом небезопасна.
- Default API не может быть production `http://localhost:3001`; нужен HTTPS production URL, HTTP только loopback dev.
- Не логировать потенциальный пользовательский text/error bodies.
- Выполнить настоящий Windows `.NET build`, unit tests и packaged app smoke на Windows runner/VM. Node проверки строк не являются C# build.

### Mac

- Current automatic send показывает большой `Checking your English…` до результата. По новой policy automatic path не показывает большой loading panel.
- Current `handleAnalysis` решает popup через `corrected != original || errors`, поэтому typo/style rewrite вызывает большой popup. Решение только через `hasClearError/errors`.
- Добавить отдельный compact success chip.
- Manual hotkey сохраняет полный loading/result/Replace flow.
- Прогнать Swift tests/build, установить подписанный agent, doctor/health и реальный smoke.

### Server/operations

- Systemd retention unit установлен на production, но service/timer unit files не находятся в tracked deploy paths. Добавить их в repo и install/update script.
- Проверить backup restore реально на отдельной временной БД; наличие backup script и integrity check не равно проверенному restore.
- Cross-platform tests должны разделяться на `source contract/static checks` и настоящие native compile/runtime suites.
- Финальный отчёт обязан явно различать: scaffolded, compiles, unit-tested, simulator/VM-tested, real-device-tested, deployed.

## 8. Тесты новой семантики

Добавить backend и client contract fixtures минимум для:

- `She don't know.` → clear_error, большой auto popup, negative grammar evidence;
- `I have seen him yesterday.` → clear_error;
- `I recieved your mesage.` → mechanical_only, errors=[], negative evidence отсутствует, auto только `Grammar OK ✓`;
- `Could you please provide me with an update?` → correct/acceptable, errors=[];
- `Can you send me an update?` и более формальный optional variant → acceptable, не error;
- `I can't make it tonight, sorry!` → correct informal English;
- US/UK pairs (`color/colour`, `at the weekend/on the weekend`) → не error;
- contraction/full form → не error;
- optional comma/style rewrite → не error;
- exact same original/correction error object → rejected by validator;
- model returns error evidence while errors=[] → negative evidence suppressed/fail closed;
- typo with canonical grammar topic → negative evidence suppressed;
- manual preview every assessment → no score;
- automatic popup policy on every assessment;
- old schema response remains decodable during rollout.

## 9. Definition of Done для follow-up

- Prompt и structured schema реализуют четыре состояния.
- Только clear objective errors находятся в `errors` и уменьшают progress.
- Typo/mechanical/style/acceptable forms никогда не уменьшают progress.
- Automatic detailed popup появляется только для `clear_error`.
- Все остальные accepted automatic results дают только компактный `Grammar OK ✓` либо ничего, если пользователь отключил confirmation.
- Manual preview всегда показывает соответствующий полный результат и остаётся score-free.
- Live Gemini eval, а не mock, проходит release gates и имеет честный report.
- Mac поведение реализовано и протестировано.
- iOS/Android/Windows перечисленные дефекты устранены; есть реальные native build/test artifacts.
- Systemd units и deployment scripts tracked.
- Production English задеплоен только после green tests/backup; Spanish не изменён и healthy.
- Git clean, commits pushed, final report не смешивает scaffold/static test с runtime proof.

Начни с обновления contract/prompt/tests, затем Mac behavior, после этого исправляй iOS/Android/Windows. Не останавливайся на новом отчёте или изменении текста prompt: требуются server invariants, client policy и реальные native builds.
