const categories = {
  fun: {
    emoji: "😄",
    name: "Fun",
    stems: [
      "Что из моих привычек кажется тебе самым",
      "В какой роли из фильма я был(а) бы самым",
      "Какой наш совместный момент был самым",
      "Что я делаю настолько странно, что это",
      "Какую суперсилу ты бы мне дал(а), потому что я"
    ],
    endings: ["нелепым?", "смешным?", "милым?", "легендарным?", "хаотичным?"]
  },
  spicy: {
    emoji: "🔥",
    name: "Spicy",
    stems: [
      "В какой ситуации я кажусь тебе",
      "Какой мой жест тебя",
      "Что во мне тебя",
      "Какой спонтанный сценарий свидания тебя",
      "Что я могу прошептать, чтобы ты"
    ],
    endings: ["самым привлекательным(ой)?", "мгновенно заводит?", "интригует сильнее всего?", "сводит с ума?", "не смог(ла) устоять?"]
  },
  deep: {
    emoji: "🧠",
    name: "Deep",
    stems: [
      "Где, как тебе кажется, я тебя",
      "Что ты хотел(а) бы, чтобы я чаще",
      "Какая моя реакция в сложных моментах тебя",
      "В каком вопросе нам важно научиться",
      "Какую правду о себе тебе сложнее всего"
    ],
    endings: ["недопонимаю?", "слышал(а)?", "ранила?", "быть честнее?", "мне сказать?"]
  },
  guess: {
    emoji: "🎯",
    name: "Guess Mode",
    stems: [
      "Что я выберу скорее",
      "Какой страх я скрываю чаще",
      "Что меня успокоит быстрее",
      "Какой комплимент мне запомнится",
      "Что я предпочту в пятницу вечером"
    ],
    endings: [": стабильность или риск?", "в новой компании?", "после тяжелого дня?", "на целый месяц?", "без раздумий?"]
  }
};

const scalePrompts = [
  "Насколько ты сейчас чувствуешь близость между нами?",
  "Насколько ты доволен(льна) тем, как мы решаем конфликты?",
  "Насколько тебе комфортно быть уязвимым(ой) рядом со мной?",
  "Насколько сегодня ты хочешь романтики?"
];

const optionsPack = [
  ["Домашний вечер", "Спонтанная поездка", "Вечеринка", "Прогулка вдвоём"],
  ["Сразу обсудить", "Сначала остыть", "Пошутить и разрядить", "Сделать паузу"],
  ["Объятия", "Слова поддержки", "Подарок", "Совместное дело"],
  ["Нежность", "Флирт", "Глубокий разговор", "Тишина рядом"]
];

function buildQuestions() {
  const list = [];
  let id = 1;

  Object.entries(categories).forEach(([mode, cfg]) => {
    for (let i = 0; i < 90; i++) {
      const stem = cfg.stems[i % cfg.stems.length];
      const ending = cfg.endings[i % cfg.endings.length];
      const typeCycle = i % 4;
      const question = {
        id: `${mode}-${id++}`,
        mode,
        text: `${cfg.emoji} ${stem} ${ending}`
      };

      if (typeCycle === 0) question.type = "open";
      if (typeCycle === 1) {
        question.type = "choice";
        question.options = optionsPack[i % optionsPack.length];
      }
      if (typeCycle === 2) {
        question.type = "scale";
        question.text = `${cfg.emoji} ${scalePrompts[i % scalePrompts.length]}`;
        question.scale = { min: 1, max: 10 };
      }
      if (typeCycle === 3) {
        question.type = "guess";
        question.text = `${cfg.emoji} Угадай: ${stem.toLowerCase()} ${ending.toLowerCase()}`;
      }
      list.push(question);
    }
  });

  return list;
}

export const QUESTIONS = buildQuestions();
