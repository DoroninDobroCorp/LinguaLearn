# Декларации конфиденциальности для магазинов приложений (Store Privacy Questionnaires)

Настоящий документ содержит спецификацию данных конфиденциальности для заполнения карточек приложений **LinguaLearn English** в Apple App Store, Google Play Store и Microsoft Store.

---

## 1. Apple App Store Privacy Nutrition Labels & PrivacyInfo.xcprivacy

Для публикации приложения контейнера iOS (`ios/LinguaLearnContainerApp`) и расширения клавиатуры (`ios/LinguaLearnKeyboardExtension`) в App Store и TestFlight.

### 1.1. Декларируемые категории данных (Data Types)
1. **User Content -> Text Messages / Written Text**:
   * *Purpose*: App Functionality (грамматический анализ и персональное обучение).
   * *Linked to User*: Yes (связано с `user_id`).
   * *Used for Tracking*: No (НЕ используется для отслеживания или рекламы).
2. **Identifiers -> Device ID / Token**:
   * *Purpose*: Account Management & Authentication (токен устройства `ll_dev_...`).
   * *Linked to User*: Yes.
   * *Used for Tracking*: No.
3. **Diagnostics -> Performance Data**:
   * *Purpose*: Developer Diagnostics (агрегированные задержки анализа нейросети).
   * *Linked to User*: No (обезличенные метрики).

### 1.2. Конфигурационный файл PrivacyInfo.xcprivacy
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeUserInputText</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeDeviceID</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array/>
</dict>
</plist>
```

---

## 2. Google Play Data Safety Section

Для публикации приложения Android контейнера и службы вводного метода клавиатуры (`android/LinguaLearn`) в Google Play Console.

### 2.1. Данные о сборе и передаче (Data Collection & Sharing)
* **Сбор данных**: Собирается пользовательский ввод (текст предложений) и токен идентификатора устройства.
* **Передача данных третьим лицам**: Нет (Data Sharing = No). Данные обрабатываются исключительно сервером LinguaLearn и API Google Gemini в рамках выполнения сервиса.
* **Шифрование при передаче**: Да (All data encrypted in transit via HTTPS/TLS 1.3).
* **Запрос на удаление данных**: Да (Users can request data deletion). Реализовано через кнопку «Удалить аккаунт» (`DELETE /api/user/account`), которая безвозвратно каскадно удаляет данные из всех 11 связанных таблиц.

### 2.2. Заполнение полей формы Google Play
1. **App Activity -> User-generated content**: Collected, Linked, App Functionality.
2. **Device or other IDs**: Collected, Linked, Account Management.
3. **App info and performance -> Crash logs & Diagnostics**: Collected, Not Linked, Analytics.

---

## 3. Microsoft Store Privacy & Data Collection Disclosures

Для публикации Windows Desktop Agent (`windows/LinguaLearnAgent`) в Microsoft Partner Center.

### 3.1. Заявление о конфиденциальности (Privacy Statement)
1. **Перехват вводных полей (UI Automation Edit Capture)**:
   * Агент отслеживает редактируемые текстовые поля операционной системы Windows.
   * Поля ввода паролей (`isSecureField`), номеров карт, одноразовых кодов и персональных идентификаторов автоматически исключаются до отправки.
2. **Локальный режим предварительного просмотра (Preview Mode)**:
   * При использовании комбинации `Ctrl+Shift+E` выполняется разовый анализ без сохранения данных в прогресс пользователя (`preview_only: 1`).
3. **Управление согласием (User Consent & Pause)**:
   * Пользователь имеет возможность в любой момент приостановить работу агента нажатием кнопки «Pause Capture» в системном трее.
4. **Политика хранения данных (Raw Text Retention)**:
   * Оригинальный текст очищается по истечении выбранного пользователем срока (0, 7 или 30 дней) автоматической службой `lingualearn-retention.service`.
