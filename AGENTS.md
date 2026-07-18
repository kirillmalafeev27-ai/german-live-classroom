# AGENTS.md — как расширять тренажёр «без преподавателя»

Этот файл фиксирует **принципы и архитектуру** самостоятельного тренажёра
(`/practice`), чтобы любой агент/разработчик мог добавить новый уровень
(например **A2**) или новые сценарии, **не ломая заложенную логику**.

Читай этот файл целиком перед тем, как трогать `/practice`, `src/practice.js`,
`src/client/practice.js`, `public/practice.html`, `src/ai.js`.

---

## 0. Рабочий процесс (общее для репозитория)

- **Ветка разработки:** `claude/german-classroom-build-fix-ymg3ru`. Коммить и
  пушь только туда (`git push -u origin <branch>`). PR не открывай без явной
  просьбы.
- **Сборка клиента:** `npm run build` (esbuild, `scripts/build.mjs`) собирает
  `src/client/*.js` → `public/assets/*.js`. Собранные бандлы **закоммичены** в
  репозиторий — после правки клиента всегда пересобирай и коммить `public/assets`.
- **Деплой:** Render Web Service. Build Command `npm ci && npm run build`,
  Start Command `npm start`, health `/health`.
- **Ловушка lockfile:** все `resolved` в `package-lock.json` должны указывать на
  `https://registry.npmjs.org/`. Никогда не пересобирай lock в закрытой среде —
  туда зашьётся внутренний прокси-реестр, и `npm ci` на Render зависнет.
- **Проверка перед пушем:** `node --check` по изменённым серверным файлам,
  `npm run build`, локальный запуск сервера и проверка эндпоинтов (см. §7).

---

## 1. Что такое тренажёр «без преподавателя»

Раздел `/practice` — самостоятельная практика немецкого **без живого учителя**.
Собеседник — модель AITUNNEL (`AITUNNEL_MODEL`, «ChatGPT-mini»). Логин и
комната не нужны. Есть два режима:

- **`dialog` — «Диалог по теме».** ИИ ведёт разговор и **задаёт вопросы так,
  чтобы ответ требовал целевой грамматики модуля**. Пример (модуль A1-12,
  Imperativ + Gesundheit): ИИ говорит «Ich habe Kopfschmerzen. Was soll ich
  machen?» → ученик отвечает командами.
- **`roleplay` — «Ролевые сценарии».** Для каждого модуля есть **2 сценария**.
  ИИ играет роль (продавец, друг, врач, администратор…), ученик — второй
  участник. Пример (A1-12): «Ленивый друг» и «Совет по здоровью».

---

## 2. НЕЗЫБЛЕМЫЕ ПРИНЦИПЫ (не нарушать)

1. **Переиспользуй панель ученика, не изобретай новый UI.**
   `/practice` собран из тех же блоков и CSS-классов, что и `/student`:
   карточка «Ваша речь» (`.mic-card`), карточка прослушивания (`.listen-card`
   с орбом и кнопками Повторить/Медленнее/Показать текст), резервный ввод
   текстом (`.typed-card`). Никаких чат-пузырей и параллельных дизайн-систем.

2. **Ключи только на сервере.** Браузер никогда не видит `AITUNNEL_API_KEY`,
   `ELEVENLABS_API_KEY`. Клиент шлёт запросы на наши эндпоинты
   (`/api/practice/*`), сервер проксирует во внешние API.

3. **Whisper распознаёт РОВНО то, что сказал ученик.** Это приложение-корректор:
   нельзя подсказывать Whisper словарь урока (иначе он «исправит» ошибку и
   спрячет её). В `src/stt.js` НЕ передавай `prompt` со словами урока,
   `temperature=0`, и фильтруй галлюцинации (`isHallucination`: Amara.org, ZDF,
   «Vielen Dank», одиночные знаки и т.п.).

4. **Исправляй точечно.** Если ученик сказал слово неправильно — правь только
   его в формате `"Nicht <falsch>. <richtig>."` (несколько подряд, если надо).
   Если верно — короткое подтверждение («Genau!», «Super!») и пустая коррекция.

5. **Подсказка — по-русски, коротко** (`hint_ru`, ≤120 симв.), про то, что
   сказать дальше / какую грамматику взять. Немецкие исправления сюда не пихать.

6. **Полная память диалога + запрет повторов.** Клиент — единственный источник
   правды: он хранит всю историю и шлёт её целиком каждый ход
   (`state.history.slice(-40)`). Последнюю реплику ученика **не дублируй**
   отдельным полем. В системном промпте держи правило «MEMORY & PROGRESS»:
   никогда не повторять уже заданный вопрос, всегда двигать диалог вперёд.

7. **Грамматика модуля обязательна.** Промпт должен подводить ученика к
   использованию `grammar` текущего модуля.

8. **Деградация без ключей.** Нет AITUNNEL → раздел выключен с понятным
   статусом. Нет Whisper → только текстовый ввод. Нет ElevenLabs → без озвучки.
   Флаги приходят из `/api/practice/scenarios` (`aiEnabled/sttEnabled/ttsEnabled`).

9. **Понятная реакция системы.** Ученик всегда видит состояние: «🎙 Слышу вас…»,
   «⏳ Распознаю…», «🔇 Звук не пойман», «✏️ Nicht … .», «💡 подсказка», ошибки.

---

## 3. Ключевые файлы

| Файл | Роль |
|------|------|
| `src/curriculum.js` | Данные 16 модулей A1 (`id,title,color,speechActs,themes,grammar,vocabulary`) + `getLesson(id)`. |
| `src/practice.js` | Сценарии по модулям (`SCENARIOS`), `listPracticeScenarios`, `getScenario`, `buildPracticeSystemPrompt`, `buildPracticeMessages`. |
| `src/ai.js` | `AiService.practiceReply()` и общий `requestChat()`. Возвращает `{reply_de, correction, hint_ru, done}`. |
| `src/stt.js` | `SttService` (AITUNNEL Whisper) + `isHallucination`. |
| `src/tts.js` | `TtsService` (ElevenLabs) — озвучка. |
| `src/server.js` | Роуты: `GET /api/practice/scenarios`, `POST /api/practice/reply`, `POST /api/practice/transcribe`, `POST /api/practice/tts`, страница `GET /practice`. |
| `public/practice.html` | Разметка на классах панели ученика. |
| `src/client/practice.js` | Логика: выбор модуля/режима/сценария, история, голос (Whisper), озвучка. |
| `src/client/shared.js` | `startVoiceCapture` (микрофон+VAD), `transcribeAudio` (умеет `path`). |
| `scripts/build.mjs` | Точки входа esbuild (`teacher`, `student`, `practice`). |

---

## 4. Модель данных

**Модуль (curriculum):**
```js
{ id: 12, title: 'Gesund und fit', color: '#993b9e',
  speechActs: ['давать советы о здоровье', ...],   // краткие RU-описания действий
  themes: ['Unfall', 'Ratgeber', ...],             // темы/тексты
  grammar: ['Imperativ'],                           // ЦЕЛЕВАЯ грамматика (главное!)
  vocabulary: ['die Gesundheit', 'der Kopf', ...]   // немецкие слова (Wörterliste)
}
```

**Сценарий (роль-плей), 2 на модуль:**
```js
{ id: 'fauler_freund', title: 'Ленивый друг',
  aiRole: 'ленивый друг, который ничего не хочет делать',
  userRole: 'мотивирующий друг',
  goal: 'Уговорите его командами (Steh auf! Mach Sport!).',
  focus: 'Imperativ',
  opener: 'Ich bin müde und will nichts machen. Sport? Nein, keine Lust.' }
```
`opener` — первая реплика ИИ по-немецки (чтобы сцена началась без лишнего вызова
модели). `listPracticeScenarios()` отдаёт клиенту всё, включая `opener`.

---

## 5. Рецепт: добавить уровень A2

Цель — тот же тренажёр, но с выбором уровня **A1 / A2**. Логику §2 НЕ менять.

### 5.1 Данные учебника A2
- Создай `src/curriculum-a2.js` с `export const curriculumA2 = [...]` — 16 модулей
  по той же схеме. Готовые данные (Sprachhandlungen/Themen/Wortfelder/Grammatik)
  ниже в §8. `vocabulary` в §8 неполный (в оглавлении есть только Wortfelder) —
  дозаполни из Wörterliste учебника A2; для работы тренажёра достаточно `grammar`
  и `themes`, `vocabulary` можно оставить как список Wortfelder-затравок.
- `color` бери по индексу из A1-палитры (`curriculum[i].color`), чтобы стиль
  совпадал.

### 5.2 Понятие уровня на сервере
- Введи `level: 'A1' | 'A2'` (по умолчанию `'A1'`, чтобы не сломать кабинет
  преподавателя, который работает на A1).
- Сделай хелпер выбора программы: `getCurriculum(level)` и
  `getLesson(level, id)` (или `getLessonByLevel`). Существующий `getLesson(id)`
  оставь работающим для A1.
- `GET /api/curriculum?level=A2` → модули A2.
- Практика-роуты (`/api/practice/*`) принимают `level` в теле/квери и передают его
  в `getLesson` и в билдер промпта.

### 5.3 Сценарии A2
- Храни сценарии по уровням: `SCENARIOS = { A1: {...}, A2: {...} }` (или отдельный
  `src/practice-a2.js` со своей картой). `getScenario(level, moduleId, id)` и
  `listPracticeScenarios(level)`.
- Автори по 2 сценария на модуль по правилам §6 и «затравкам» из §8.

### 5.4 Промпт под A2
- В `buildPracticeSystemPrompt` прокинь `level`. Для A2 смягчи ограничения:
  «A2 learner», допускаются более длинные предложения, прошедшие времена
  (Perfekt/Präteritum), придаточные (weil/dass/wenn) — то есть грамматика,
  которую даёт A2. Всё остальное (память, точечные исправления, `hint_ru`,
  JSON-формат) — без изменений.

### 5.5 UI
- В `public/practice.html` добавь в `.setup-row` селект **Уровень** (A1/A2)
  первым. При смене уровня: перезагрузи модули (`/api/curriculum?level=`) и
  сценарии (`/api/practice/scenarios?level=`), обнови выпадашки.
- Больше НИЧЕГО в разметке не меняй — те же карточки.

### 5.6 Не забудь
- `scripts/build.mjs` править не нужно (точка входа `practice` уже есть).
- Пересобрать (`npm run build`) и закоммитить `public/assets/practice.js`.
- Обновить `RENDER_WEB_SERVICE.md` (упомянуть выбор уровня) и `openapi.js`
  (параметр `level`).

---

## 6. Правила авторства сценариев

- **Ровно 2 сценария на модуль.** Разные ситуации, обе завязаны на `grammar`
  модуля и его `themes`.
- `opener` — короткая реплика ИЛИ вопрос **на немецком** уровня модуля, сразу
  в роли, заканчивается вопросом.
- `aiRole` / `userRole` / `goal` — по-русски, конкретно (кто ИИ, кто ученик, что
  должен сделать ученик и какой грамматикой).
- `focus` — целевая грамматика (из `grammar` модуля).
- Роли берём из жизни модуля: у врача, в магазине, по телефону, договориться о
  встрече, рассказать о прошлом (Perfekt/Präteritum), сравнить (Komparativ) и т.д.

---

## 7. Definition of Done / проверка

```bash
node --check src/practice.js && node --check src/server.js && node --check src/ai.js
npm run build            # exit 0, есть public/assets/practice.js
PORT=3990 AITUNNEL_API_KEY=dummy node src/server.js &   # поднять сервер
curl -s "localhost:3990/api/practice/scenarios?level=A2" | head    # модули/сценарии A2
curl -s -X POST localhost:3990/api/practice/reply -H 'Content-Type: application/json' \
  -d '{"level":"A2","moduleId":1,"mode":"dialog","history":[]}'      # 502 с dummy-ключом = ок
```
- Без `AITUNNEL_API_KEY` раздел выключается с понятным статусом (не падает).
- История: 3–4 хода подряд — ИИ **не повторяет** вопросы (см. `buildPracticeMessages`,
  тест на отсутствие дубля последней реплики ученика).
- Клиент: выбор уровня → модули и сценарии соответствуют уровню.

---

## 8. Готовые данные учебника A2 (16 модулей)

Источник — оглавление A2. Формат под `src/curriculum-a2.js`. `speechActs`/`themes`
даны как в книге (немецкий) — при желании локализуй в RU для отображения; в промпт
идут как есть. `vocabulary` = Wortfelder-затравки (дозаполни из Wörterliste A2).
В скобках после названия — страница учебника и предлагаемая грамматика-focus.

```js
export const curriculumA2 = [
  { id: 1,  title: 'Auf Reisen', // с.10
    speechActs: ['über eine Reise erzählen','eine Stadt beschreiben','über Vergangenes sprechen','eine Verlustanzeige bei der Polizei machen','Informationen über eine Stadt verstehen','einen Weg beschreiben'],
    themes: ['Reisen','Stadtbesichtigung','Wegbeschreibung','Verlustanzeige bei der Polizei','Reiseblog','Reiseführer-App Wien'],
    grammar: ['Perfekt: Partizip II bei untrennbaren Verben','Präpositionen durch, an … vorbei, gegenüber von, gegen (Ort)','Konjunktionen und, oder, aber, deshalb'],
    vocabulary: ['Reisen','Stadt'] },
  { id: 2,  title: 'Ziele und Wünsche', // с.16
    speechActs: ['über Migrationswünsche sprechen','etwas begründen','Telefongespräche führen','höflich um etwas bitten','sich über Kursangebote informieren','über Sprachlernbiografien sprechen'],
    themes: ['höfliche Bitten','Telefondialoge','Kursangebote','Zeitschriftenartikel','Werbeflyer','Sachtext'],
    grammar: ['Nebensätze mit weil','könnte-'],
    vocabulary: ['Telefonieren','Lernen'] },
  { id: 3,  title: 'Hoch, höher, am höchsten', // с.26
    speechActs: ['Hobbys beschreiben und bewerten','einen Zeitungsbericht verstehen','etwas vergleichen','über Veranstaltungen sprechen','ein Gedicht schreiben'],
    themes: ['Freizeitaktivitäten','Poetry-Slam','Zeitungsbericht','Veranstaltungshinweis'],
    grammar: ['Nebensätze mit dass','Komparativ und Superlativ'],
    vocabulary: ['Freizeitaktivitäten'] },
  { id: 4,  title: 'Ein toller Fernsehabend', // с.32
    speechActs: ['ein Fernsehprogramm verstehen','über das Fernsehen sprechen','über eine Person sprechen','über das Fernsehverhalten sprechen'],
    themes: ['Fernsehprogramm','Eurovision Song Contest','Sendungen','Zeitschriftenartikel'],
    grammar: ['Adjektive nach indefinitem und negativem Artikel','Wortbildung: Adjektive mit un-'],
    vocabulary: ['Fernsehen','Fernsehsendungen'] },
  { id: 5,  title: 'Alltag oder Wahnsinn?', // с.42
    speechActs: ['über Medien im Alltag sprechen','den Alltag beschreiben','sagen, dass man etwas nicht gut findet','etwas bewerten','einen Werbetext verstehen'],
    themes: ['Apps im Alltag','Alltag','Wellness','Zeitungsartikel','Werbung','E-Mail','Homepage eines Hostels','Blog'],
    grammar: ['Präpositionen ab, bis, zwischen (Zeit)','reflexive Verben'],
    vocabulary: ['Alltagsaktivitäten'] },
  { id: 6,  title: 'Die schwarzen oder die bunten Stühle?', // с.48
    speechActs: ['über Möbel sprechen','Einkaufsdialoge führen','etwas telefonisch bestellen','etwas telefonisch reklamieren','einen Reklamationsschein ausfüllen'],
    themes: ['Wohnungseinrichtung','Upcycling','Einkaufsdialoge','Online-Katalog','Liefer- und Reklamationsschein','Interview'],
    grammar: ['Adjektive nach definitem Artikel','Präposition aus (Material)'],
    vocabulary: ['Bestellung','Reklamation'] },
  { id: 7,  title: 'Wohin kommt das Sofa?', // с.58
    speechActs: ['über die Lage von Orten sprechen','über die Wohnsituation sprechen','Wohnungsanzeigen verstehen','einen Besichtigungstermin vereinbaren','erklären, wohin etwas kommt','Kleinanzeigen verstehen und schreiben'],
    themes: ['Stadtplan','Wohnungssuche','Umzug','Blog','Wohnungsanzeigen','Kleinanzeigen'],
    grammar: ['Wechselpräpositionen'],
    vocabulary: ['Wohnungssuche'] },
  { id: 8,  title: 'Lebenslinien', // с.64
    speechActs: ['über Schulzeit und Kindheit erzählen','Erstaunen ausdrücken','über Biografien und Ausbildung sprechen','einen Text über eine bekannte Person schreiben'],
    themes: ['Kindheit','Schule','Ausbildung','Boulevard der Stars','Zeitungsartikel'],
    grammar: ['Modalverben im Präteritum','Wortbildung: Nomen auf -heit, -keit, -ung'],
    vocabulary: ['Schule','Ausbildung'] },
  { id: 9,  title: 'Die lieben Kollegen', // с.74
    speechActs: ['über den Büroalltag sprechen','über Probleme am Arbeitsplatz sprechen','geschäftliche E-Mails schreiben','einen Termin vereinbaren','sagen, was man im Büro wichtig findet'],
    themes: ['Büroalltag','Quiz','Radio-Interview','geschäftliche E-Mail','Statistik'],
    grammar: ['Nebensätze mit wenn'],
    vocabulary: ['Computersprache','Büro'] },
  { id: 10, title: 'Mein Smartphone & ich', // с.80
    speechActs: ['Beratungsdialoge führen','technische Informationen über Geräte erfragen','über Apps sprechen','Apps beschreiben','über Vor- und Nachteile diskutieren','seine Meinung äußern'],
    themes: ['Apps','Werbeflyer','Beratungsdialog','Zeitschriftenartikel','Diskussion'],
    grammar: ['indirekte Fragen','zum + Nomen (Infinitiv)'],
    vocabulary: ['Handy und Smartphone'] },
  { id: 11, title: 'Freunde tun gut', // с.90
    speechActs: ['über Freundschaft sprechen','eine Person beschreiben','eine Freundschaftsgeschichte nacherzählen','über Vergangenes sprechen','seine Meinung äußern'],
    themes: ['Freundschaft','bekannte Freundschaften','Zitate','Zeitschriftenartikel'],
    grammar: ['Präteritum von kommen, geben, mögen','Nebensätze mit als'],
    vocabulary: ['Freundschaft','Adjektive zur Personenbeschreibung'] },
  { id: 12, title: 'Eins – eins – zwei', // с.96
    speechActs: ['einen Unfall beschreiben','einen Notruf machen','eine Verletzung beschreiben','Dialoge beim Arzt führen','Ratschläge geben','über ein besonderes Projekt sprechen'],
    themes: ['Unfall','Notruf','Notaufnahme im Krankenhaus','ROTE NASEN – Clowns im Krankenhaus','Zeitschriftenartikel'],
    grammar: ['Wortbildung: Adjektive auf -los und -bar','sollte-'],
    vocabulary: ['Krankenhaus','Notfall'] },
  { id: 13, title: 'Hat es geschmeckt?', // с.106
    speechActs: ['über Essgewohnheiten sprechen','Vorlieben ausdrücken','ein Restaurant empfehlen','im Restaurant bestellen und bezahlen','etwas reklamieren','regionale Spezialitäten und Lieblingsgerichte beschreiben'],
    themes: ['Restaurantdialoge','Restaurantanzeigen','Speisekarte','österreichische Küche','Blog'],
    grammar: ['welch- und dies-','etwas/nichts + Nomen'],
    vocabulary: ['Dinge im Restaurant','Essen/Gerichte'] },
  { id: 14, title: 'Einkaufswelt', // с.112
    speechActs: ['über Shoppen und Einkaufen sprechen','über Vorurteile sprechen','sich im Einkaufszentrum orientieren','Empfehlungen geben','über Einkaufsstraßen sprechen'],
    themes: ['Frauen und Männer beim Shoppen','Einkaufsstraßen','Zeitschriftenartikel','Orientierungstafel','Leserbrief'],
    grammar: ['Relativsätze: Nominativ und Akkusativ'],
    vocabulary: ['Geschäfte','Konsumartikel'] },
  { id: 15, title: 'Partylaune', // с.122
    speechActs: ['Einladungen und Glückwünsche aussprechen','über Feste sprechen','sich für eine Einladung bedanken, zusagen/absagen','ein Fest / eine Feier planen','ein Hochzeitsfest beschreiben'],
    themes: ['Einladungs- und Glückwunschkarten','Feste','Berufsbild Hochzeitsplanerin','Zeitschriftenartikel'],
    grammar: ['Relativsätze mit Präposition','Wortbildung: Nomen auf -chen und -lein'],
    vocabulary: ['Feste und Feiern'] },
  { id: 16, title: 'Kulturwelten', // с.128
    speechActs: ['ein Veranstaltungsprogramm verstehen','von einer Veranstaltung erzählen','seine Musikinteressen beschreiben','ein Gedicht verstehen und schreiben'],
    themes: ['Straßenkunst','Musikfeste','Kühlschrankpoesie','Veranstaltungsprogramm','Gedicht'],
    grammar: ['Verben mit Präpositionen','Fragewörter mit wo(r)-'],
    vocabulary: ['Kunst und Kultur'] }
];
```

### 8.1 Затравки для сценариев A2 (по 2 на модуль)

Автори `opener` по правилам §6. Ниже — идеи ролей/ситуаций и `focus`:

| Модуль | Сценарий A (роль ИИ → задача ученика) | Сценарий B |
|---|---|---|
| 1 Auf Reisen | Друг расспрашивает о поездке → рассказать в Perfekt | Полиция: заявить о потере вещи (Verlustanzeige) |
| 2 Ziele und Wünsche | Сотрудник курсов по телефону → вежливо узнать/попросить (könnte-, weil) | Собеседник спрашивает о планах на переезд → обосновать (weil) |
| 3 Hoch, höher… | Ведущий сравнивает хобби → сравнить (Komparativ/Superlativ) | Друг зовёт на мероприятие → согласовать, высказать мнение (dass) |
| 4 Fernsehabend | Друг зовёт смотреть ТВ → обсудить передачи/мнение | Опрос о привычках просмотра ТВ |
| 5 Alltag | Друг о буднях и приложениях → описать день (reflexive Verben, ab/bis/zwischen) | Реакция на рекламу: что нравится/нет |
| 6 Stühle/Möbel | Продавец по телефону → заказать/рекламировать (Adj. nach def. Artikel, aus + Material) | Разговор про обстановку/Upcycling |
| 7 Wohin kommt das Sofa | Переезд: куда что ставить (Wechselpräpositionen: Akk./Dativ) | Арендодатель: договориться об осмотре |
| 8 Lebenslinien | Собеседник о детстве/школе → рассказать (Modalverben Präteritum) | Рассказать биографию известного человека |
| 9 Kollegen | Коллега о проблемах в офисе → обсудить (Nebensätze mit wenn) | Договориться о встрече по телефону |
| 10 Smartphone | Консультант в магазине техники → узнать характеристики (indirekte Fragen) | Спор о плюсах/минусах приложений |
| 11 Freunde | Друг просит описать общего знакомого → описать (Präteritum kommen/geben/mögen, als) | Пересказать историю дружбы |
| 12 Eins-eins-zwei | Экстренный вызов 112: описать несчастный случай/травму (sollte-) | У врача: жалобы и советы |
| 13 Hat es geschmeckt | Официант в ресторане → заказать, оплатить, рекламировать (welch-/dies-) | Порекомендовать блюдо/ресторан |
| 14 Einkaufswelt | Консультант в ТЦ → сориентироваться, спросить дорогу (Relativsätze) | Обсудить предубеждения о шопинге |
| 15 Partylaune | Друг приглашает на праздник → поблагодарить, принять/отказаться | Спланировать праздник с организатором (Relativsätze mit Präposition) |
| 16 Kulturwelten | Друг о программе фестиваля → рассказать о мероприятии (Verben mit Präpositionen, wo(r)-) | Описать музыкальные интересы |

---

## 9. Анти-паттерны (чего НЕ делать)

- ❌ Подсказывать Whisper словарь урока (прячет ошибки ученика).
- ❌ Делать для `/practice` отдельный дизайн — только классы панели ученика.
- ❌ Слать реплику ученика и в `history`, и отдельным `userText` (двойной счёт →
  ИИ зацикливается).
- ❌ Класть ключи API в клиентский код или в CSP `connectSrc` для прямых
  браузерных вызовов внешних API.
- ❌ Пересобирать `package-lock.json` в закрытой среде (внутренний реестр →
  зависший `npm ci` на Render).
- ❌ Пушить в ветку, отличную от рабочей, или открывать PR без просьбы.
