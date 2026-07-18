import { getLesson } from './curriculum.js';
import { getA2Lesson } from './curriculum-a2.js';

// Self-study practice: a learner picks a module and a mode, and ChatGPT-mini
// (via AITUNNEL) becomes the German conversation partner. Two modes:
//   - 'dialog'   : topic drill. The AI asks questions that force the module's
//                  target grammar (e.g. Imperativ + Gesundheit ->
//                  "Ich habe Kopfschmerzen. Was soll ich machen?").
//   - 'roleplay' : a concrete scene per module. The AI plays one role, the
//                  learner the other (e.g. module 12: a lazy friend, or a
//                  patient asking for advice).

export const practiceModes = [
  {
    id: 'dialog',
    title: 'Диалог по теме',
    description: 'ИИ задаёт вопросы по теме модуля так, чтобы вы отвечали нужной грамматикой.'
  },
  {
    id: 'roleplay',
    title: 'Ролевые сценарии',
    description: 'ИИ берёт роль (продавец, друг, врач…), а вы отвечаете как второй участник.'
  }
];

// Two role-play scenarios per module. `opener` is the AI's first German line so
// the scene starts in character without an extra model call.
const A1_SCENARIOS = {
  1: [
    { id: 'kennenlernen', title: 'Знакомство', aiRole: 'новый студент курса', userRole: 'студент', goal: 'Представьтесь: имя, откуда вы, что вы учите.', focus: 'sein, W-Fragen', opener: 'Hallo! Ich bin Lena. Wie heißt du und woher kommst du?' },
    { id: 'hobbys', title: 'Что тебе нравится', aiRole: 'новый знакомый', userRole: 'студент', goal: 'Скажите, что вам нравится (mögen).', focus: 'mögen', opener: 'Ich mag Musik und Kaffee. Und du? Was magst du?' }
  ],
  2: [
    { id: 'kollegen', title: 'Новые коллеги', aiRole: 'коллега на новой работе', userRole: 'новый сотрудник', goal: 'Расскажите о профессии (als, bei).', focus: 'als/bei, Beruf', opener: 'Guten Tag! Ich arbeite als Ingenieurin bei Siemens. Was sind Sie von Beruf?' },
    { id: 'empfang', title: 'Данные на ресепшене', aiRole: 'администратор', userRole: 'посетитель', goal: 'Назовите адрес, e-mail и телефон.', focus: 'адрес, числа', opener: 'Guten Tag! Ich brauche Ihre Daten. Wie ist Ihre Adresse und Ihre Telefonnummer?' }
  ],
  3: [
    { id: 'kursraum', title: 'В аудитории', aiRole: 'одногруппник', userRole: 'студент', goal: 'Называйте предметы с артиклем (Nominativ).', focus: 'артикли, Nominativ', opener: 'Entschuldigung, was ist das? Ist das ein Kuli oder ein Bleistift?' },
    { id: 'flohmarkt', title: 'На барахолке', aiRole: 'продавец', userRole: 'покупатель', goal: 'Спросите, что это и сколько стоит.', focus: 'Nominativ, kosten', opener: 'Hallo! Hier gibt es viele Sachen. Der Tisch ist schön. Was möchten Sie sehen?' }
  ],
  4: [
    { id: 'geschaeft', title: 'В магазине', aiRole: 'продавец-консультант', userRole: 'покупатель', goal: 'Скажите, что хотите купить (möchten, Akkusativ).', focus: 'möchten, Akkusativ', opener: 'Guten Tag! Kann ich Ihnen helfen? Was möchten Sie kaufen?' },
    { id: 'meinung', title: 'Мнение о покупке', aiRole: 'друг на шопинге', userRole: 'друг', goal: 'Скажите мнение о вещи (finden, denken).', focus: 'finden/denken, Akkusativ', opener: 'Schau mal, diese Sonnenbrille! Wie findest du die?' }
  ],
  5: [
    { id: 'freizeit', title: 'Интервью о хобби', aiRole: 'ведущий радио', userRole: 'гость', goal: 'Расскажите о свободном времени (trennbare Verben).', focus: 'trennbare Verben, man', opener: 'Hallo und willkommen! Sagen Sie: Was machen Sie gern in der Freizeit?' },
    { id: 'verabredung', title: 'Договориться о встрече', aiRole: 'друг', userRole: 'друг', goal: 'Договоритесь о дне и времени (am Montag …).', focus: 'am + Wochentag, Position 1', opener: 'Ich möchte am Wochenende etwas machen. Wann hast du Zeit?' }
  ],
  6: [
    { id: 'familie', title: 'Семейные фото', aiRole: 'друг', userRole: 'хозяин фото', goal: 'Опишите семью (Possessivartikel).', focus: 'Possessivartikel', opener: 'Ist das ein Familienfoto? Wer ist das? Ist das dein Bruder?' },
    { id: 'party', title: 'На вечеринке', aiRole: 'гость на вечеринке', userRole: 'гость', goal: 'Поговорите: где были, кого знаете (Präteritum sein).', focus: 'Präteritum sein, Akkusativ pron', opener: 'Hallo! Schöne Party, oder? Woher kennst du die Gastgeberin?' }
  ],
  7: [
    { id: 'kochen', title: 'Планируем ужин', aiRole: 'сосед по квартире', userRole: 'сосед', goal: 'Скажите, что нужно купить/сделать (wollen, müssen).', focus: 'wollen/müssen, Nullartikel', opener: 'Wollen wir heute zusammen kochen? Was müssen wir kaufen?' },
    { id: 'cafe', title: 'Заказ в кафе', aiRole: 'официант', userRole: 'гость', goal: 'Сделайте заказ (Ich hätte gern / Ich nehme).', focus: 'Ich hätte gern / nehmen', opener: 'Guten Tag! Was darf es sein?' }
  ],
  8: [
    { id: 'termin', title: 'Назначить встречу', aiRole: 'коллега', userRole: 'коллега', goal: 'Договоритесь о времени (können, um/am).', focus: 'können, um/am/von…bis', opener: 'Wir brauchen einen Termin. Können Sie am Montag um zehn Uhr?' },
    { id: 'tagesablauf', title: 'Мой день', aiRole: 'собеседник', userRole: 'рассказчик', goal: 'Опишите свой день по времени.', focus: 'время, trennbare Verben', opener: 'Sag mal, wann stehst du morgens auf? Und wann arbeitest du?' }
  ],
  9: [
    { id: 'verkehr', title: 'Как ты добираешься', aiRole: 'друг', userRole: 'собеседник', goal: 'Скажите, на чём ездите (mit + Dativ).', focus: 'mit/zu + Dativ', opener: 'Wie kommst du zur Uni? Fährst du mit dem Bus?' },
    { id: 'wegfrage', title: 'Спросить дорогу', aiRole: 'прохожий', userRole: 'турист', goal: 'Спросите, как добраться (zu + Dativ).', focus: 'zu + Dativ', opener: 'Kann ich helfen? Wohin möchten Sie gehen?' }
  ],
  10: [
    { id: 'wochenende', title: 'Выходные', aiRole: 'коллега', userRole: 'коллега', goal: 'Расскажите, что делали (Perfekt).', focus: 'Perfekt', opener: 'Hallo! Was hast du am Wochenende gemacht?' },
    { id: 'dienstreise', title: 'Командировка', aiRole: 'коллега', userRole: 'вернувшийся из поездки', goal: 'Расскажите о поездке в прошедшем времени (Perfekt).', focus: 'Perfekt', opener: 'Wie war deine Dienstreise nach Berlin? Was ist passiert?' }
  ],
  11: [
    { id: 'wohnung', title: 'Осмотр квартиры', aiRole: 'арендодатель', userRole: 'арендатор', goal: 'Скажите, где что стоит (Wechselpräpositionen + Dativ).', focus: 'Wechselpräpositionen (Dativ)', opener: 'Willkommen! Das ist das Wohnzimmer. Wo steht das Sofa, sehen Sie?' },
    { id: 'zimmer', title: 'Твоя комната', aiRole: 'друг', userRole: 'хозяин комнаты', goal: 'Опишите, где находятся вещи.', focus: 'Dativ, Ortsangaben', opener: 'Zeig mal dein Zimmer! Wo ist dein Schreibtisch?' }
  ],
  12: [
    { id: 'arzt', title: 'Совет по здоровью', aiRole: 'человек, который жалуется на здоровье', userRole: 'советчик/врач', goal: 'Дайте советы в повелительном наклонении (Trink Tee! Geh zum Arzt!).', focus: 'Imperativ', opener: 'Hallo! Ich habe Kopfschmerzen und Fieber. Was soll ich machen?' },
    { id: 'fauler_freund', title: 'Ленивый друг', aiRole: 'ленивый друг, который ничего не хочет делать', userRole: 'мотивирующий друг', goal: 'Уговорите его командами (Steh auf! Mach Sport! Iss gesund!).', focus: 'Imperativ', opener: 'Ich bin müde und will nichts machen. Sport? Nein, keine Lust.' }
  ],
  13: [
    { id: 'einladung', title: 'Приглашение на праздник', aiRole: 'друг', userRole: 'приглашённый', goal: 'Ответьте на приглашение, назовите дату/подарок (Dativ+Akkusativ).', focus: 'Verben mit Dativ+Akkusativ, Datum', opener: 'Ich mache eine Party am fünften Mai. Kommst du? Was bringst du mir mit?' },
    { id: 'geschenke', title: 'Подарки', aiRole: 'друг', userRole: 'советчик', goal: 'Скажите, кому что подарить (schenken/geben + Dativ).', focus: 'schenken/geben + Dativ', opener: 'Bald ist Weihnachten. Was schenkst du deiner Mutter?' }
  ],
  14: [
    { id: 'kleidung', title: 'Примеряем одежду', aiRole: 'продавец', userRole: 'покупатель', goal: 'Скажите, идёт/нравится ли (gefallen, passen, stehen + Dativ).', focus: 'Verben mit Dativ', opener: 'Guten Tag! Dieser Pullover ist schön. Gefällt er Ihnen?' },
    { id: 'wetter', title: 'Погода и одежда', aiRole: 'друг', userRole: 'собеседник', goal: 'Опишите погоду и что наденете (es, Wetter).', focus: 'es, Wetterverben', opener: 'Wie ist das Wetter heute bei dir? Was ziehst du an?' }
  ],
  15: [
    { id: 'wegbeschreibung', title: 'Спросить дорогу', aiRole: 'прохожий', userRole: 'турист', goal: 'Спросите дорогу (Wie komme ich…?) и поймите ответ.', focus: 'sollen, bis zu/an + Dativ', opener: 'Hallo! Sie sehen etwas verloren aus. Wohin möchten Sie?' },
    { id: 'bahnhof', title: 'На вокзале', aiRole: 'сотрудник справочной на вокзале', userRole: 'пассажир', goal: 'Спросите про путь, билет, что можно/нельзя (dürfen, sollen).', focus: 'sollen/dürfen', opener: 'Guten Tag! Wie kann ich Ihnen helfen?' }
  ],
  16: [
    { id: 'urlaub', title: 'Планы на отпуск', aiRole: 'друг', userRole: 'собеседник', goal: 'Скажите, что бы вы хотели сделать (würde gern).', focus: 'würde gern + Infinitiv', opener: 'Bald sind Ferien! Was würdest du gern machen?' },
    { id: 'hotel', title: 'Бронирование отеля', aiRole: 'администратор отеля', userRole: 'гость', goal: 'Забронируйте номер и опишите пожелания (reservieren, in + Dativ).', focus: 'reservieren, in + Dativ', opener: 'Hotel Seeblick, guten Tag! Möchten Sie ein Zimmer reservieren?' }
  ]
};

const A2_SCENARIOS = {
  1: [
    { id: 'verlust', title: 'Пропажа в поездке', aiRole: 'полицейский', userRole: 'турист', goal: 'Опишите потерянную вещь и обстоятельства пропажи.', focus: 'Perfekt, Stadt, Verlustanzeige', opener: 'Guten Tag. Was haben Sie verloren und wo ist das passiert?' },
    { id: 'stadtfuehrung', title: 'Экскурсия по городу', aiRole: 'экскурсовод', userRole: 'турист', goal: 'Расспросите о городе и объясните свой маршрут.', focus: 'durch, vorbei, gegenüber', opener: 'Willkommen! Was möchten Sie heute in unserer Stadt besichtigen?' }
  ],
  2: [
    { id: 'sprachkurs', title: 'Запись на языковой курс', aiRole: 'сотрудник VHS', userRole: 'кандидат', goal: 'Узнайте об уровне, расписании и вежливо попросите подходящий вариант.', focus: 'weil, könnte', opener: 'Guten Tag! Für welchen Deutschkurs interessieren Sie sich?' },
    { id: 'migration', title: 'Новые планы', aiRole: 'друг', userRole: 'человек с планами на переезд', goal: 'Расскажите о целях и объясните причины.', focus: 'Ziele, Wünsche, weil', opener: 'Du möchtest auswandern? Wohin möchtest du gehen und warum?' }
  ],
  3: [
    { id: 'wettbewerb', title: 'Конкурс талантов', aiRole: 'ведущий конкурса', userRole: 'участник', goal: 'Опишите своё увлечение и сравните его с другими.', focus: 'Komparativ, Superlativ, dass', opener: 'Willkommen beim Wettbewerb! Was kannst du besonders gut?' },
    { id: 'hobbyvergleich', title: 'Выбираем новое хобби', aiRole: 'друг', userRole: 'друг', goal: 'Сравните несколько занятий и выберите лучшее.', focus: 'höher, besser, am liebsten', opener: 'Sollen wir klettern, tanzen oder Tischtennis spielen? Was findest du besser?' }
  ],
  4: [
    { id: 'fernsehplan', title: 'Что посмотреть?', aiRole: 'друг', userRole: 'друг', goal: 'Обсудите программу и договоритесь, что смотреть.', focus: 'was für ein, Sendungen', opener: 'Was für eine Sendung möchtest du heute Abend sehen?' },
    { id: 'casting', title: 'Телевизионный кастинг', aiRole: 'ведущий кастинга', userRole: 'кандидат', goal: 'Представьтесь и опишите себя.', focus: 'Adjektivdeklination, Personenbeschreibung', opener: 'Willkommen zum Casting! Was für ein Mensch sind Sie?' }
  ],
  5: [
    { id: 'alltagsstress', title: 'Очень загруженный день', aiRole: 'друг', userRole: 'собеседник', goal: 'Опишите распорядок и объясните, почему вы опоздали.', focus: 'reflexive Verben, ab/bis/zwischen', opener: 'Du siehst gestresst aus. Wie war dein Tag?' },
    { id: 'wellness', title: 'Выходной в wellness-отеле', aiRole: 'администратор', userRole: 'гость', goal: 'Узнайте об услугах и спланируйте отдых.', focus: 'Alltag, Erholung, Zeitangaben', opener: 'Willkommen! Wie möchten Sie sich heute bei uns erholen?' }
  ],
  6: [
    { id: 'moebelbestellung', title: 'Заказ мебели', aiRole: 'сотрудник интернет-магазина', userRole: 'покупатель', goal: 'Выберите мебель, уточните материал, размер и доставку.', focus: 'Adjektivdeklination, aus + Material', opener: 'Guten Tag! Welche Möbel möchten Sie bestellen?' },
    { id: 'reklamation', title: 'Рекламация', aiRole: 'служба поддержки', userRole: 'недовольный покупатель', goal: 'Объясните проблему с заказом и потребуйте решение.', focus: 'Bestellung, Lieferung, Reklamation', opener: 'Kundenservice, guten Tag. Was ist mit Ihrer Bestellung passiert?' }
  ],
  7: [
    { id: 'wohnungsbesichtigung', title: 'Просмотр квартиры', aiRole: 'арендодатель', userRole: 'кандидат на аренду', goal: 'Расспросите о квартире, цене и расположении.', focus: 'Wohnungssuche, Wechselpräpositionen', opener: 'Willkommen zur Besichtigung. Was möchten Sie über die Wohnung wissen?' },
    { id: 'umzug', title: 'Расставляем мебель', aiRole: 'помощник при переезде', userRole: 'хозяин квартиры', goal: 'Объясните, куда поставить вещи.', focus: 'wo/wohin, Dativ/Akkusativ', opener: 'Wohin soll ich das Sofa und die Kisten stellen?' }
  ],
  8: [
    { id: 'schulzeit', title: 'Воспоминания о школе', aiRole: 'бывший одноклассник', userRole: 'одноклассник', goal: 'Расскажите о школе, учителях и детстве.', focus: 'Präteritum der Modalverben', opener: 'Weißt du noch? Was mussten wir früher in der Schule machen?' },
    { id: 'biografie', title: 'Интервью о биографии', aiRole: 'журналист', userRole: 'известный человек', goal: 'Расскажите об образовании и важных событиях жизни.', focus: 'Biografie, Ausbildung', opener: 'Wo sind Sie geboren und welche Ausbildung haben Sie gemacht?' }
  ],
  9: [
    { id: 'buero_problem', title: 'Проблема в офисе', aiRole: 'IT-специалист', userRole: 'сотрудник', goal: 'Опишите техническую проблему и попросите помощь.', focus: 'Büro, wenn, IT', opener: 'IT-Service, guten Tag. Was funktioniert bei Ihnen nicht?' },
    { id: 'termin', title: 'Перенести совещание', aiRole: 'коллега', userRole: 'организатор', goal: 'Отмените или перенесите встречу и объясните причину.', focus: 'Termin, E-Mail, wenn', opener: 'Wir haben morgen eine Besprechung. Passt der Termin noch?' }
  ],
  10: [
    { id: 'smartphoneberatung', title: 'Выбор смартфона', aiRole: 'консультант', userRole: 'покупатель', goal: 'Уточните характеристики и выберите модель.', focus: 'indirekte Fragen, Technik', opener: 'Guten Tag! Was ist Ihnen bei einem Smartphone besonders wichtig?' },
    { id: 'app_diskussion', title: 'Полезные приложения', aiRole: 'друг', userRole: 'собеседник', goal: 'Обсудите плюсы и минусы приложений.', focus: 'Meinung, zustimmen, widersprechen', opener: 'Welche App benutzt du am häufigsten, und warum?' }
  ],
  11: [
    { id: 'freundschaft', title: 'История дружбы', aiRole: 'журналист', userRole: 'герой статьи', goal: 'Расскажите, как началась ваша дружба.', focus: 'Präteritum, als', opener: 'Wann und wie haben Sie Ihren besten Freund kennengelernt?' },
    { id: 'freund_beraten', title: 'Что важно в дружбе?', aiRole: 'новый знакомый', userRole: 'собеседник', goal: 'Опишите хорошего друга и аргументируйте мнение.', focus: 'Personenbeschreibung, Freundschaft', opener: 'Was macht für dich einen wirklich guten Freund aus?' }
  ],
  12: [
    { id: 'notruf', title: 'Экстренный вызов 112', aiRole: 'диспетчер службы спасения', userRole: 'свидетель происшествия', goal: 'Сообщите, что случилось, где вы и в каком состоянии пострадавший.', focus: 'Notruf, Verletzung', opener: 'Notruf 112. Wo genau ist der Unfall passiert?' },
    { id: 'beim_arzt', title: 'После несчастного случая', aiRole: 'врач', userRole: 'пациент', goal: 'Опишите симптомы и получите рекомендации.', focus: 'Krankheit, sollte, -bar/-los', opener: 'Guten Tag. Was ist passiert und wo haben Sie Schmerzen?' }
  ],
  13: [
    { id: 'restaurant', title: 'Ужин в ресторане', aiRole: 'официант', userRole: 'гость', goal: 'Уточните состав блюд, закажите и оцените еду.', focus: 'welch-/dies-, Essen', opener: 'Guten Abend! Möchten Sie zuerst eine Vorspeise bestellen?' },
    { id: 'empfehlung', title: 'Рекомендуем местную кухню', aiRole: 'турист', userRole: 'местный житель', goal: 'Посоветуйте ресторан и региональные блюда.', focus: 'Gerichte, Empfehlung', opener: 'Ich möchte etwas Typisches essen. Welches Restaurant empfehlen Sie mir?' }
  ],
  14: [
    { id: 'einkaufszentrum', title: 'В торговом центре', aiRole: 'сотрудник информации', userRole: 'покупатель', goal: 'Узнайте, где находятся нужные магазины.', focus: 'Relativsätze, Geschäfte', opener: 'Guten Tag! Welchen Laden suchen Sie?' },
    { id: 'kaufberatung', title: 'Совет перед покупкой', aiRole: 'друг', userRole: 'покупатель', goal: 'Сравните магазины и объясните решение.', focus: 'Relativsätze, Vorteile', opener: 'In welchem Geschäft möchtest du einkaufen, und warum gerade dort?' }
  ],
  15: [
    { id: 'partyplanung', title: 'Планируем сюрприз', aiRole: 'друг-организатор', userRole: 'организатор', goal: 'Распределите задачи и подготовьте праздник.', focus: 'Relativsätze mit Präposition, Party', opener: 'Wir planen eine Überraschungsparty. Welche Aufgaben möchtest du übernehmen?' },
    { id: 'hochzeit', title: 'Свадебный форс-мажор', aiRole: 'свадебный координатор', userRole: 'помощник', goal: 'Обсудите проблемы и предложите решения.', focus: 'Hochzeit, Panne, Vorschläge', opener: 'Wir haben ein Problem: Der Strom ist ausgefallen. Was können wir tun?' }
  ],
  16: [
    { id: 'kulturprogramm', title: 'Выбираем мероприятие', aiRole: 'сотрудник инфоцентра', userRole: 'посетитель', goal: 'Расспросите о программе и выберите событие.', focus: 'Verben mit Präpositionen, wo(r)-', opener: 'Willkommen! Wofür interessieren Sie sich: Musik, Theater oder Straßenkunst?' },
    { id: 'festival', title: 'После фестиваля', aiRole: 'друг', userRole: 'посетитель фестиваля', goal: 'Расскажите о впечатлениях и любимом выступлении.', focus: 'sich freuen über, denken an, träumen von', opener: 'Wie war das Festival? Worüber hast du dich besonders gefreut?' }
  ]
};

const SCENARIOS_BY_LEVEL = { A1: A1_SCENARIOS, A2: A2_SCENARIOS };

export function normalizePracticeLevel(level) {
  return String(level || '').toUpperCase() === 'A2' ? 'A2' : 'A1';
}

export function getPracticeLesson(level, moduleId) {
  return normalizePracticeLevel(level) === 'A2' ? getA2Lesson(moduleId) : getLesson(moduleId);
}

export function listPracticeScenarios(level = 'A1') {
  const source = SCENARIOS_BY_LEVEL[normalizePracticeLevel(level)];
  const result = {};
  for (const [moduleId, scenarios] of Object.entries(source)) {
    result[moduleId] = scenarios.map(({ id, title, aiRole, userRole, goal, focus, opener }) => ({
      id, title, aiRole, userRole, goal, focus, opener
    }));
  }
  return result;
}

export function getScenario(moduleId, scenarioId, level = 'A1') {
  const source = SCENARIOS_BY_LEVEL[normalizePracticeLevel(level)];
  return (source[Number(moduleId)] || []).find((item) => item.id === scenarioId) || null;
}

export function getScenarioOpener(moduleId, scenarioId, level = 'A1') {
  return getScenario(moduleId, scenarioId, level)?.opener || '';
}

export function buildPracticeSystemPrompt({ level = 'A1', moduleId, mode, scenario }) {
  const normalizedLevel = normalizePracticeLevel(level);
  const lesson = getPracticeLesson(normalizedLevel, moduleId);
  const grammar = (lesson?.grammar || []).join('; ');
  const themes = (lesson?.themes || []).join('; ');
  const vocab = (lesson?.vocabulary || []).slice(0, 70).join(', ');

  const common = `You are a friendly, patient German conversation partner and tutor for a ${normalizedLevel} learner.
The course level is ${normalizedLevel}. The lesson module is "${lesson?.id}. ${lesson?.title}".
TARGET GRAMMAR (the learner must practise this): ${grammar || 'A1 basics'}.
TOPICS: ${themes || lesson?.title}.
USEFUL VOCABULARY (prefer these words): ${vocab}.

RULES:
- Speak level-appropriate ${normalizedLevel} German: clear sentences, the target grammar, and vocabulary from this module.
- Keep every "reply_de" to 1-3 short sentences and normally end with ONE question so the dialogue continues.
- MEMORY & PROGRESS: The full conversation so far is given to you. Read it. NEVER repeat a question you (the assistant) already asked and NEVER re-ask something the learner already answered. Each of your turns must move the dialogue FORWARD to a new detail, sub-topic or follow-up that builds on the learner's previous answers. If a natural line of talk is exhausted, open a new related sub-topic within the module — do not loop back to the beginning.
- Steer the conversation so the learner is naturally forced to use the TARGET GRAMMAR.
- Check the learner's last message. If there are wrong German words, put a short correction in "correction" using the pattern "Nicht <falsch>. <richtig>." (only the wrong words; chain several if needed). If the learner was correct, set "correction" to "" and you may briefly acknowledge in reply_de like "Genau!" or "Super!".
- "hint_ru": ONE short Russian hint (max 120 chars) telling the learner what to say next or which grammar to use. Never put German corrections here.
- Set "done" to true only if the learner clearly says goodbye or wants to stop.
- If the learner writes in Russian or is stuck, gently answer and give a German example to repeat.
- Return VALID JSON ONLY with exactly these keys: reply_de, correction, hint_ru, done.`;

  if (mode === 'roleplay' && scenario) {
    return `${common}

MODE: ROLE-PLAY.
SCENE: ${scenario.title}. You play the role of: ${scenario.aiRole}. The learner is: ${scenario.userRole}.
LEARNER'S GOAL: ${scenario.goal}
Stay fully in character for your role and keep the scene going. Do not break character to explain grammar (use the "hint_ru" field for tips).`;
  }

  return `${common}

MODE: TOPIC DIALOGUE.
Lead a natural dialogue on the module topic. Ask questions that require the learner to answer using the TARGET GRAMMAR (for example, for Imperativ + Gesundheit: complain about a symptom and ask "Was soll ich machen?" so the learner answers with imperatives).`;
}

export function buildPracticeMessages({ level = 'A1', moduleId, mode, scenario, history = [], userText = '' }) {
  const system = buildPracticeSystemPrompt({ level, moduleId, mode, scenario });
  const messages = [{ role: 'system', content: system }];

  // The client is the single source of truth for the conversation and sends the
  // whole history (its last turn is usually the learner's message). We map every
  // turn so the model always has the full context and can move forward instead
  // of looping. `userText` is only a fallback for callers that don't append it
  // to history themselves.
  const turns = history.map((turn) => ({
    role: turn?.role === 'ai' ? 'assistant' : 'user',
    content: String(turn?.text || '')
  })).filter((turn) => turn.content);

  const lastUserInHistory = turns.length && turns[turns.length - 1].role === 'user';
  if (userText && !lastUserInHistory) {
    turns.push({ role: 'user', content: String(userText) });
  }

  for (const turn of turns.slice(-40)) messages.push(turn);

  if (turns.length === 0) {
    messages.push({ role: 'user', content: 'Начни диалог: поздоровайся по-немецки и задай первый вопрос по теме.' });
  }
  return messages;
}
