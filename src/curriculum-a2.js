const COLORS = [
  '#75b62b', '#66b52f', '#25965f', '#258f72', '#73806f', '#777777', '#268ec9', '#367fc5',
  '#4868ad', '#4663a9', '#8d4e9b', '#9a4e9b', '#d43d83', '#df3b82', '#dc395e', '#dc3655'
];

function lesson(id, title, coursebookPage, speechActs, themes, grammar, vocabulary) {
  return {
    id,
    level: 'A2',
    title,
    color: COLORS[id - 1],
    sourcePdfPage: 5 + (id * 10),
    coursebookPage,
    speechActs,
    themes,
    grammar,
    vocabulary
  };
}

export const a2Curriculum = [
  lesson(1, 'Auf Reisen', 10,
    ['рассказать о поездке', 'описать город', 'говорить о прошлом', 'составить заявление о пропаже', 'объяснить дорогу'],
    ['путешествия', 'город', 'достопримечательности', 'потерянные вещи'],
    ['Perfekt с неотделяемыми глаголами', 'durch, an ... vorbei, gegenüber von, gegen', 'und, oder, aber, deshalb'],
    [
      'das Flugticket', 'der Flughafen', 'der Abflug', 'abfliegen', 'ankommen', 'die Eintrittskarte', 'das Gepäck',
      'die Postkarte', 'die Semesterferien', 'die Entscheidung', 'da sein', 'der Flug', 'buchen', 'der Rucksack',
      'der Anfang', 'stressig', 'der Reisepass', 'verlieren', 'besichtigen', 'die Burg', 'das Wohnhaus', 'der Sitzplatz',
      'hoffentlich', 'sofort', 'die Eisdiele', 'die Boutique', 'die Buchhandlung', 'durch', 'das Tor', 'gegen',
      'die Bank', 'an ... vorbei', 'gegenüber von', 'die Handtasche', 'weg sein', 'die Verlustanzeige', 'der Park',
      'die Geldbörse', 'der Bundespräsident', 'die Bundespräsidentin', 'mehrere', 'die Kultur', 'zum Beispiel',
      'sitzen', 'die Bar', 'genießen', 'die Natur', 'bieten', 'die Öffnungszeit', 'unbedingt'
    ]),

  lesson(2, 'Ziele und Wünsche', 16,
    ['говорить о желаниях миграции', 'обосновывать мнение', 'вести телефонный разговор', 'вежливо просить', 'рассказывать о профессии'],
    ['миграция', 'телефонные разговоры', 'курсы', 'профессиональная биография'],
    ['придаточные предложения с weil', 'вежливая форма könnte', 'ударение в сложных словах'],
    [
      'akzeptieren', 'aufmachen', 'auswandern', 'chatten', 'kommunizieren', 'skypen', 'surfen', 'verlassen', 'weil',
      'der Übersetzer', 'die Übersetzerin', 'der Wunsch', 'die Brücke', 'die Chance', 'die Hoffnung', 'die Migration',
      'die Stelle', 'die Fremdsprache', 'die Übersetzung', 'besetzt sein', 'drücken', 'verbinden', 'wählen',
      'die Durchwahl', 'die Rechnung', 'die Taste', 'der Intensivkurs', 'der Einstufungstest', 'das Tandem', 'könnte',
      'der Muttersprachler', 'die Muttersprachlerin', 'die Politik', 'die Volkshochschule', 'diskutieren', 'werden',
      'der Anfänger', 'die Anfängerin', 'der Tanz', 'bestellen', 'die Hausaufgabe', 'das Schloss', 'die Bühne',
      'nördlich von', 'östlich von', 'südlich von', 'westlich von', 'der Norden', 'der Osten', 'der Süden', 'der Westen'
    ]),

  lesson(3, 'Hoch, höher, am höchsten', 26,
    ['описывать и оценивать увлечения', 'сравнивать занятия', 'говорить о мероприятиях', 'рассказывать стихотворение'],
    ['досуг', 'соревнования', 'Poetry-Slam', 'газетное сообщение'],
    ['придаточные с dass', 'Komparativ и Superlativ', 'сравнение с wie и als'],
    [
      'schneiden', 'springen', 'vorlesen', 'das Haustier', 'das Tischtennis', 'das Märchen', 'der Enkel', 'die Enkelin',
      'die Gitarre', 'ausprobieren', 'intelligent', 'der Onkel', 'So ein Quatsch!', 'der Wettbewerb', 'dass', 'klettern',
      'anstrengend', 'blöd', 'spannend', 'nervös', 'der Spieler', 'die Spielerin', 'dabei sein', 'denn', 'stapeln',
      'genauso', 'merken', 'nächst-', 'vor allem', 'üben', 'das Fernsehen', 'das Mal', 'das nächste Mal',
      'der Erwachsene', 'die Erwachsene', 'der Spaß', 'die Sekunde', 'gewinnen', 'malen', 'auswendig', 'eigen-',
      'kämpfen', 'schlagen', 'das Gedicht', 'das Publikum', 'das Wort', 'der Inhalt', 'der Sieger', 'die Siegerin',
      'die Halle', 'die Liste', 'die Show', 'furchtbar'
    ]),

  lesson(4, 'Ein toller Fernsehabend', 32,
    ['понимать телепрограмму', 'говорить о телешоу', 'описывать человека', 'обсуждать телевизионные привычки'],
    ['телепрограмма', 'Eurovision Song Contest', 'телепередачи', 'газетная статья'],
    ['was für ein', 'склонение прилагательных после неопределённого и отрицательного артикля', 'прилагательные с un-'],
    [
      'der Animationsfilm', 'die Dokumentation', 'die Nachrichten', 'was für ein', 'das Quiz', 'die Sendung',
      'der Liebesfilm', 'die Serie', 'hübsch', 'auftreten', 'begleiten', 'deutschsprachig', 'moderieren', 'plötzlich',
      'vorher', 'das Lied', 'der Erfolg', 'der Kandidat', 'die Kandidatin', 'der Komiker', 'die Komikerin',
      'der Moderator', 'die Moderatorin', 'der Preis', 'der Sänger', 'die Sängerin', 'die Karriere', 'die Stimme',
      'einzeln', 'live', 'das Paar', 'der Teil', 'entscheiden', 'ersetzen', 'gelten', 'halb', 'normal',
      'der Internetnutzer', 'die Internetnutzerin', 'der Sender', 'die Mediathek', 'die Online-Videothek', 'angemeldet sein',
      'bauen', 'tief', 'das Mietshaus', 'der Schrebergarten', 'dekorieren', 'gießen', 'pflanzen'
    ]),

  lesson(5, 'Alltag oder Wahnsinn?', 42,
    ['говорить о медиа в быту', 'описывать повседневность', 'говорить о неважном', 'рассказывать о прошедших выходных'],
    ['приложения в быту', 'повседневность', 'wellness', 'электронная почта', 'блог'],
    ['временные предлоги ab, bis, zwischen', 'возвратные глаголы', 'Perfekt в рассказе о выходных'],
    [
      'ab', 'auswählen', 'gemeinsam', 'in der Nähe', 'sich informieren', 'öffentlich', 'planen', 'sparen',
      'unterwegs sein', 'der Alltag', 'der Einkauf', 'der Fahrplan', 'der Supermarkt', 'die Apotheke', 'die App',
      'die Organisation', 'koordinieren', 'nie', 'verschlafen', 'sich ansehen', 'sich anziehen', 'sich ausziehen',
      'sich kämmen', 'sich rasieren', 'sich schminken', 'sich waschen', 'der Spiegel', 'die Wäsche', 'aufhängen',
      'sich streiten', 'froh', 'pünktlich', 'sauer', 'der Stress', 'gerade', 'hektisch', 'sich entschuldigen',
      'sich treffen', 'der Haushalt', 'der Kindergarten', 'die Schuld', 'sich ärgern', 'sich beeilen', 'sich freuen',
      'sich fühlen', 'das Hallenbad', 'das Hostel', 'der Blick', 'der Mitarbeiter', 'die Mitarbeiterin', 'der Ruheraum',
      'die Sauna', 'die Jugendherberge', 'die Erholung', 'entspannt', 'wiederkommen', 'sich erholen'
    ]),

  lesson(6, 'Die schwarzen oder die bunten Stühle?', 48,
    ['говорить о мебели', 'заказывать по телефону', 'понимать счёт', 'оформлять рекламацию'],
    ['обстановка жилья', 'upcycling', 'онлайн-каталог', 'доставка', 'рекламация'],
    ['склонение прилагательных после определённого артикля', 'предлог aus для материала'],
    [
      'altmodisch', 'wegwerfen', 'der Teppich', 'gucken', 'die Möbel', 'behalten', 'im Angebot sein', 'aus + Material',
      'weich', 'das Gewicht', 'das Material', 'das Glas', 'das Metall', 'der Stoff', 'die Größe', 'die Höhe', 'die Keramik',
      'gesamt', 'der Artikel', 'der Auftrag', 'der Lieferschein', 'der Liefertermin', 'die Bestellung', 'die Menge',
      'reklamieren', 'zurückschicken', 'das Formular', 'ausfüllen', 'der Reklamationsschein', 'abschicken', 'das Paket',
      'der Absender', 'ergänzen', 'liefern', 'der Grund', 'die Beschreibung', 'der Trolley', 'kaputtgehen', 'kreativ',
      'stabil', 'umweltbewusst', 'das Holz', 'das Plastik', 'der Flugbegleiter', 'die Flugbegleiterin', 'sich wohlfühlen',
      'der Apparat', 'historisch', 'das Einkaufszentrum', 'das Parlament', 'der Franken', 'der Politiker',
      'die Politikerin', 'die Münze', 'das Gebäude', 'der Brunnen'
    ]),

  lesson(7, 'Wohin kommt das Sofa?', 58,
    ['говорить о расположении мест', 'обсуждать жильё', 'договариваться о просмотре', 'объяснять переезд'],
    ['план города', 'поиск квартиры', 'переезд', 'объявления о жилье'],
    ['Wechselpräpositionen', 'wo/wohin с Dativ и Akkusativ'],
    [
      'der Dom', 'das Stadion', 'der Zoo', 'außerhalb', 'los sein', 'verkehrsgünstig', 'der Fluglärm', 'stören',
      'die Altbauwohnung', 'die Miete', 'das Dachgeschoss', 'das Obergeschoss', 'der Mieter', 'die Mieterin',
      'der Strom', 'der Vermieter', 'die Vermieterin', 'die Einbauküche', 'die Nebenkosten', 'die Betriebskosten',
      'in Ordnung sein', 'monatlich', 'sich interessieren', 'die Katzenbox', 'die Kiste', 'das Spielzeug', 'der Sessel',
      'der Keller', 'Achtung!', 'besorgen', 'bitten', 'stellen', 'verschenken', 'vorbeikommen', 'weglaufen',
      'das Meerschweinchen', 'die Bauarbeiten', 'das Verständnis', 'das Würstchen', 'der Finderlohn', 'der Hof',
      'der Kinderwagen', 'der Mitbewohner', 'die Mitbewohnerin', 'fremd', 'schließen', 'wegfliegen'
    ]),

  lesson(8, 'Lebenslinien', 64,
    ['рассказывать о школе и детстве', 'говорить о биографии и образовании', 'описывать известного человека'],
    ['детство', 'школа', 'образование', 'биографии'],
    ['модальные глаголы в Präteritum', 'существительные с -heit, -keit, -ung'],
    [
      'die Schulzeit', 'die Kindheit', 'böse', 'damals', 'ehemalig', 'leihen', 'streng', 'das Papier', 'der Leser',
      'die Leserin', 'die Ecke', 'die Klasse', 'sich erinnern', 'sich unterhalten', 'wahr', 'wissen', 'geboren sein',
      'teilnehmen', 'wechseln', 'das Gymnasium', 'das Schwimmbad', 'das Studium', 'das Zeugnis', 'der Autor', 'die Autorin',
      'der Einwanderer', 'die Einwanderin', 'der Komponist', 'die Komponistin', 'der Muslim', 'die Muslimin', 'der Zufall',
      'die Ausbildung', 'die Band', 'die Hauptrolle', 'die Hauptschule', 'die Klassenfahrt', 'die Realschule', 'abschließen',
      'der Abschluss', 'die Grundschule', 'die Note', 'möglich', 'österreichisch', 'das Filmfestival', 'der Filmemacher',
      'die Filmemacherin', 'der Stein', 'die Hauptstadt', 'sterben', 'extra'
    ]),

  lesson(9, 'Die lieben Kollegen', 74,
    ['говорить о работе в офисе', 'описывать проблемы', 'писать деловые письма', 'назначать и переносить встречи'],
    ['офис', 'деловая электронная почта', 'радиоинтервью', 'статистика'],
    ['придаточные предложения с wenn', 'формулы деловой переписки'],
    [
      'abstürzen', 'aktuell', 'der Aufzug', 'außerdem', 'beantworten', 'sich beschweren', 'doppelt', 'einig',
      'das Gehalt', 'gründen', 'die Hilfe', 'um Hilfe bitten', 'der IT-Experte', 'die IT-Expertin', 'jemand', 'komplett',
      'peinlich', 'rausgehen', 'reagieren', 'die Situation', 'das Team', 'die Treppe', 'unfreundlich', 'sich verhalten',
      'vorsichtig', 'wenn', 'sich wundern', 'absagen', 'der Anhang', 'ausdrucken', 'beenden', 'Bescheid geben',
      'die Besprechung', 'die Datei', 'die Daten', 'einschalten', 'löschen', 'Mit freundlichen Grüßen', 'der Ordner',
      'das Postfach', 'privat', 'das Protokoll', 'Sehr geehrte Damen und Herren', 'senden', 'speichern', 'technisch',
      'verschieben', 'vorschlagen', 'weiterleiten', 'abwechslungsreich', 'das Drittel', 'die Sicherheit', 'sinnvoll'
    ]),

  lesson(10, 'Mein Smartphone & ich', 80,
    ['вести консультационный диалог', 'говорить о технических характеристиках', 'описывать приложения', 'обсуждать плюсы и минусы'],
    ['приложения', 'смартфоны', 'реклама', 'консультация', 'дискуссия'],
    ['косвенные вопросы', 'zum + существительное от глагола', 'выражение мнения'],
    [
      'der Akku', 'das Display', 'das Smartphone', 'der Speicherplatz', 'der Tarif', 'der Vertrag', 'bis zu', 'silber',
      'die SMS', 'der Zoll', 'ob', 'halten', 'die Tastatur', 'der Stadtplan', 'erkennen', 'navigieren', 'dringend',
      'herunterladen', 'zeichnen', 'anfassen', 'die Bibliothek', 'der Computervirus', 'digital', 'eigentlich',
      'elektronisch', 'die Entwicklung', 'heutig', 'die Lösung', 'nutzlos', 'riechen', 'sogar', 'umweltfreundlich',
      'verbrauchen', 'zuverlässig', 'die Meinung', 'unsicher', 'zustimmen', 'ausstellen', 'beraten', 'besprechen',
      'die Visitenkarte', 'zuhören'
    ]),

  lesson(11, 'Freunde tun gut', 90,
    ['говорить о дружбе', 'описывать человека', 'пересказывать историю', 'говорить о прошлом', 'выражать мнение'],
    ['дружба', 'известные друзья', 'цитаты', 'журнальная статья'],
    ['Präteritum глаголов kommen, gehen, mögen', 'придаточные предложения с als'],
    [
      'ehrlich', 'die Freundschaft', 'Spaß haben', 'der Applaus', 'gleich', 'das Unglück', 'das Zitat', 'das Abenteuer',
      'das Magazin', 'ängstlich', 'das Beste', 'die Biene', 'blond', 'dumm', 'dünn', 'das Huhn', 'lieb', 'die Liebe',
      'klug', 'mutig', 'schwach', 'übersetzen', 'der Unsinn', 'verliebt sein', 'weinen', 'die Zeitschrift',
      'zusammenhalten', 'als', 'der Ärger', 'brennen', 'der Rauch', 'sich verlieben', 'die Zigarette', 'das Thema',
      'das Alter', 'der Bär', 'die Bärin', 'berichten', 'der Käfig', 'leidtun', 'offiziell', 'schreien', 'tierisch',
      'ungewöhnlich', 'das Zuhause', 'zum Lachen bringen', 'zusammenleben', 'teilen'
    ]),

  lesson(12, 'Eins - eins - zwei', 96,
    ['описывать несчастный случай', 'вызывать помощь', 'говорить о травме', 'вести диалог у врача', 'давать советы'],
    ['несчастный случай', 'экстренная помощь', 'больница', 'проект Rote Nasen'],
    ['прилагательные с -los и -bar', 'sollte для совета', 'лексика экстренного вызова'],
    [
      'das Blut', 'bluten', 'das Krankenhaus', 'der Krankenwagen', 'die Notaufnahme', 'der Patient', 'die Patientin',
      'sich stoßen', 'sich verletzen', 'die Verletzung', 'putzen', 'sich Sorgen machen', 'der Finger', 'bewusstlos',
      'der Notruf', 'stürzen', 'ansprechbar', 'auflegen', 'die Autobahn', 'das Bewusstsein', 'die Brust', 'erreichbar',
      'erreichen', 'hilflos', 'kaum', 'der Verletzte', 'die Verletzte', 'das Geburtsdatum', 'die Gesundheitskarte',
      'die Krankenkasse', 'die Krankheit', 'die Operation', 'das Gehirn', 'die Gehirnerschütterung', 'das Rezept',
      'die Schmerztablette', 'die Grippe', 'der Husten', 'Mir ist schlecht', 'der Schnupfen', 'auf jeden Fall',
      'einschlafen', 'der Kamillentee', 'der Clown', 'die Clownin', 'der Humor', 'jonglieren', 'der Krankenpfleger',
      'die Krankenpflegerin', 'der Künstler', 'die Künstlerin', 'unternehmen', 'der Wettkampf', 'der Verein'
    ]),

  lesson(13, 'Hat es geschmeckt?', 106,
    ['говорить о привычках питания', 'выражать предпочтения', 'рекомендовать ресторан', 'заказывать и жаловаться', 'описывать блюда'],
    ['ресторанные диалоги', 'рестораны', 'меню', 'австрийская кухня'],
    ['welch- и dies-', 'etwas/nichts с существительным или субстантивированным прилагательным'],
    [
      'die Altstadt', 'aromatisch', 'authentisch', 'die Beilage', 'bitter', 'die Erdnuss', 'frisch', 'das Fruchteis',
      'das Gericht', 'das Gewürz', 'das Hauptgericht', 'die Kantine', 'mild', 'das Motto', 'der Nachtisch', 'die Nuss',
      'perfekt', 'salzig', 'scharf', 'die Suppe', 'vegan', 'vegetarisch', 'verwenden', 'die Zutat', 'die Bohne',
      'der Champignon', 'der Essig', 'die Forelle', 'die Gabel', 'der Grill', 'das Kartoffelpüree', 'die Kirsche',
      'der Knoblauch', 'das Lammkotelett', 'der Löffel', 'das Messer', 'die Olive', 'der Pfeffer', 'der Rotwein',
      'das Schnitzel', 'die Serviette', 'das Steak', 'trocken', 'die Vorspeise', 'der Betrieb', 'braten',
      'der Feinschmecker', 'das Gebäck', 'der Gulasch', 'die Identität', 'der Knödel', 'der Pfannkuchen', 'regional', 'ursprünglich'
    ]),

  lesson(14, 'Einkaufswelt', 112,
    ['говорить о покупках', 'обсуждать преимущества', 'ориентироваться в торговом центре', 'давать рекомендации'],
    ['покупательские привычки', 'торговые центры', 'магазины', 'торговые улицы'],
    ['Relativsätze в Nominativ и Akkusativ', 'описание товаров и магазинов'],
    [
      'beobachten', 'die Kasse', 'der Käufer', 'die Käuferin', 'das Parkhaus', 'persönlich', 'der Shopper', 'die Shopperin',
      'ausgeben', 'der Baumarkt', 'beschreiben', 'einzig', 'der Elektromarkt', 'emotional', 'rational', 'sinnlos',
      'das Verhalten', 'die Creme', 'die Drogerie', 'der Drucker', 'das Jackett', 'die Kosmetik', 'die Krawatte',
      'der Optiker', 'das Parfüm', 'die Schere', 'die Seife', 'der Spielzeugladen', 'die Weinhandlung', 'das Souvenir',
      'preiswert', 'breit', 'nennen', 'die Speisekarte', 'das Weinlokal', 'schick', 'die Kneipe', 'die Currywurst',
      'der Dieb', 'die Diebin', 'backen', 'die Form', 'legen', 'der Ofen'
    ]),

  lesson(15, 'Partylaune', 122,
    ['поздравлять и приглашать', 'принимать или отклонять приглашение', 'планировать праздник', 'описывать свадьбу'],
    ['приглашения', 'поздравительные открытки', 'праздники', 'свадьба'],
    ['Relativsätze с предлогом', 'существительные с -chen и -lein'],
    [
      'basteln', 'Bescheid sagen', 'gratulieren', 'Ihr Lieben!', 'rund', 'schwanger', 'die Überraschung', 'zurückkommen',
      'das Besteck', 'den Tisch decken', 'der DJ', 'das Geschirr', 'sich langweilen', 'die Musikanlage', 'öde',
      'das Picknick', 'der Rest', 'schrecklich', 'der Sinn', 'träumen', 'ausfallen', 'die Behörde', 'die Braut',
      'der Bräutigam', 'das Brautpaar', 'der Brautstrauß', 'die Dekoration', 'das Gewitter', 'das Herz',
      'der Hochzeitsplaner', 'die Hochzeitsplanerin', 'kaputtmachen', 'der Luftballon', 'die Möglichkeit', 'die Panne',
      'der Profi', 'schiefgehen', 'das Standesamt', 'übernehmen', 'verantwortlich', 'der Vorschlag'
    ]),

  lesson(16, 'Kulturwelten', 128,
    ['понимать программу мероприятий', 'рассказывать о событии', 'говорить о музыкальных интересах', 'понимать и писать стихотворение'],
    ['уличное искусство', 'музыкальные фестивали', 'культурные проекты', 'программа мероприятий'],
    ['глаголы с предлогами', 'вопросительные слова с wo(r)-', 'местоименные наречия'],
    [
      'sich ärgern über', 'der Akrobat', 'die Akrobatin', 'die Akrobatik', 'denken an', 'einladen zu',
      'sich freuen auf', 'sich freuen über', 'gehören zu', 'das Honorar', 'sich informieren über', 'der Infostand',
      'sich interessieren für', 'klatschen', 'leer', 'die Nation', 'träumen von', 'die Vorstellung', 'warten auf',
      'der Zuschauer', 'die Zuschauerin', 'das Open Air', 'das Lieblingsorchester', 'wachsen', 'die Fahne', 'die Kutsche',
      'das Pferd', 'reiten', 'der Reiter', 'die Reiterin', 'der Schneemann', 'die Uniform', 'verbrennen', 'verabschieden',
      'anmachen', 'die Glocke', 'läuten', 'das Symbol'
    ])
];

export const getA2Lesson = (lessonId) => a2Curriculum.find((item) => item.id === Number(lessonId));
