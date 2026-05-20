const XLSX = require('xlsx');

const QUESTIONNAIRE_SECTION_TITLES = new Set([
  "Самочувствие",
  "Внешний вид",
  "Пищеварение",
  "Женское здоровье",
  "Мужское здоровье",
  "Дыхательная система",
  "Сердечно-сосудистая система",
  "Скелетно-мышечная система",
  "Имунная система",
  "Питание и пищевые привычки",
  "Физическая активность",
  "Уровень стресса",
  "Вредные привычки",
  "Анамез",
  "Прием витаминов и медикаментов",
  "Наследственность и генетика",
  "Оценка готовности"
]);

const qText = (value) => {
  if (value == null) return "";
  return String(value).replace(/\r/g, "").replace(/\u00A0/g, " ").trim();
};

const qRow = (raw, idx) => raw[idx] || [];

const qCell = (row, idx) => row[idx] == null ? null : row[idx];

const qIsChecked = (value) => {
  if (value === true) return true;
  const s = qText(value).toLowerCase();
  return s === "true" || s === "истина" || s === "да";
};

const qIsBooleanText = (value) => {
  if (value === true || value === false) return true;
  const s = qText(value).toLowerCase();
  return s === "true" || s === "false" || s === "истина" || s === "ложь";
};

const qRowTexts = (row) => row.map(v => qText(v)).filter(Boolean);

const qFindCellIndex = (row, predicate) => {
  for (let i = 0; i < row.length; i++) {
    if (predicate(qText(row[i]), i)) return i;
  }
  return -1;
};

const qFindLabeledValue = (raw, labelRegex) => {
  for (let i = 0; i < raw.length; i++) {
    const row = qRow(raw, i);
    const idx = qFindCellIndex(row, text => labelRegex.test(text.toLowerCase()));
    if (idx === -1) continue;

    for (let j = idx + 1; j < Math.min(idx + 4, row.length); j++) {
      const sameRow = qText(row[j]);
      if (sameRow && !labelRegex.test(sameRow.toLowerCase())) return sameRow;
    }

    for (let j = i + 1; j < Math.min(i + 4, raw.length); j++) {
      const nextRow = qRow(raw, j);
      const sameCol = qText(nextRow[idx]);
      if (sameCol && !labelRegex.test(sameCol.toLowerCase())) return sameCol;
      const any = qRowTexts(nextRow).find(text => !labelRegex.test(text.toLowerCase()));
      if (any) return any;
    }
  }
  return "";
};

const qPickFirstNumber = (value) => {
  const s = qText(value).replace(/,/g, ".");
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? m[0] : "";
};

const qZoneForIndex = (idx) => Math.max(0, Math.floor(idx / 10));

const qBuildZoneTexts = (row) => {
  const zones = {};
  row.forEach((cell, idx) => {
    const text = qText(cell);
    if (!text || qIsChecked(cell) || qIsBooleanText(cell) || qLooksLikeScaleValue(cell)) return;
    const zone = qZoneForIndex(idx);
    if (!zones[zone]) zones[zone] = [];
    zones[zone].push(text);
  });
  return zones;
};

const qLooksLikeScaleValue = (value) => {
  const t = qText(value);
  if (!t) return false;
  if (/^\d{1,2}$/.test(t)) {
    const n = +t;
    return n >= 0 && n <= 10;
  }
  if (/^\d{1,3}\s*%$/.test(t)) {
    const n = +t.replace("%", "").trim();
    return n >= 0 && n <= 100;
  }
  return false;
};

const qExtractCheckedAnswers = (row, prevRow = [], nextRow = []) => {
  const out = [];
  for (let i = 0; i < row.length; i++) {
    if (!qIsChecked(row[i])) continue;
    let label = "";
    let labelCol = null;
    for (let j = i + 1; j < Math.min(i + 6, row.length); j++) {
      const next = row[j];
      if (qIsChecked(next) || typeof next === "boolean" || qIsBooleanText(next)) continue;
      const text = qText(next);
      if (text) {
        label = text;
        labelCol = j;
        break;
      }
    }
    if (!label) {
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        const prev = row[j];
        if (qIsChecked(prev) || typeof prev === "boolean" || qIsBooleanText(prev)) continue;
        const text = qText(prev);
        if (text) {
          label = text;
          labelCol = j;
          break;
        }
      }
    }
    if (!label) {
      const prevCol = qText(prevRow[i]);
      const nextCol = qText(nextRow[i]);
      if (qLooksLikeScaleValue(prevCol)) {
        label = prevCol;
        labelCol = i;
      } else if (qLooksLikeScaleValue(nextCol)) {
        label = nextCol;
        labelCol = i;
      }
    }
    if (label) out.push({ zone: qZoneForIndex(labelCol == null ? i : labelCol), col: i, answer: label });
  }
  return out;
};

const qDetectGender = (raw, sheetName) => {
  let hasFemale = false;
  let hasMale = false;
  for (const row of raw) {
    const texts = qRowTexts(row).map(qNorm);
    if (texts.some(t => t.includes("женское здоровье"))) hasFemale = true;
    if (texts.some(t => t.includes("мужское здоровье"))) hasMale = true;
  }
  if (hasFemale && !hasMale) return "female";
  if (hasMale && !hasFemale) return "male";
  const lowerSheet = qText(sheetName).toLowerCase();
  if (lowerSheet.includes("жен")) return "female";
  if (lowerSheet.includes("муж")) return "male";
  return "unknown";
};

const qGuessQuestionnaireGroup = (sectionTitle, strings) => {
  const sec = qNorm(sectionTitle);
  const joined = strings.map(qNorm).join(" | ");

  if (sec.includes("самочувствие")) {
    if (joined.includes("энерг") || joined.includes("пик энергии") || joined.includes("уровень энергии")) return "Энергия";
    if (joined.includes("тревож") || joined.includes("беспоко") || joined.includes("как часто") || joined.includes("как давно длится")) return "Тревожность";
    if (joined.includes("настроен")) return "Настроение";
    if (joined.includes("сон") || joined.includes("отход ко сну") || joined.includes("как спите") || joined.includes("заснуть") || joined.includes("пробужд")) return "Сон";
    if (joined.includes("концент") || joined.includes("сосредоточ") || joined.includes("оцените качество")) return "Концентрация";
  }

  if (sec.includes("внешний вид")) {
    if (joined.includes("кожа")) return "Кожа";
    if (joined.includes("ногт")) return "Ногти";
    if (joined.includes("волос")) return "Волосы";
  }

  if (sec.includes("пищеварение")) {
    if (joined.includes("язык")) return "Язык";
    if (joined.includes("стул") || joined.includes("изжог") || joined.includes("вздут") || joined.includes("тяжест") || joined.includes("тошнот")) return "Пищеварение";
  }

  if (sec.includes("мужское здоровье")) {
    if (joined.includes("либидо")) return "Либидо";
    if (joined.includes("потенц")) return "Потенция";
    return "Мужское здоровье";
  }

  if (sec.includes("женское здоровье")) {
    if (joined.includes("цикл") || joined.includes("менстру") || joined.includes("месячн")) return "Цикл";
    if (joined.includes("пмс") || joined.includes("предменстру")) return "ПМС";
    return "Женское здоровье";
  }

  if (sec.includes("имунная система") || sec.includes("иммунная система")) return "Иммунитет";
  if (sec.includes("уровень стресса")) return "Стресс";
  if (sec.includes("вредные привычки")) return "Привычки";
  if (sec.includes("анамез") || sec.includes("анамнез") || sec.includes("наследственность") || sec.includes("витаминов и медикаментов")) return "Анамнез";
  if (sec.includes("сердечно-сосудистая")) return "Сердечно-сосудистая система";
  if (sec.includes("дыхательная")) return "Дыхательная система";
  if (sec.includes("скелетно-мышечная")) return "Скелетно-мышечная система";
  if (sec.includes("питание")) return "Питание и пищевые привычки";
  if (sec.includes("физическая активность")) return "Физическая активность";

  return "";
};

const qFindLabelBelow = (raw, labelRegex) => qFindLabeledValue(raw, labelRegex);

const qExtractGoals = (raw) => {
  const goals = [];
  let start = -1;

  for (let i = 0; i < raw.length; i++) {
    const row = qRow(raw, i);
    if (row.some(cell => qText(cell).toLowerCase() === "мои цели на программу")) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return goals;

  for (let i = start; i < raw.length; i++) {
    const row = qRow(raw, i);
    const texts = qRowTexts(row);
    const numbered = texts.find(v => /^\d+\.$/.test(v));
    if (numbered) {
      const text = texts.find(v => !/^\d+\.$/.test(v));
      if (text) goals.push(text);
      continue;
    }
    if (goals.length && texts.length) break;
  }
  return goals;
};

const qEnsureSection = (questionnaire, title) => {
  let section = questionnaire.sections.find(s => s.title === title);
  if (!section) {
    section = { title, groups: [], comments: [] };
    questionnaire.sections.push(section);
  }
  return section;
};

const qEnsureGroup = (section, title) => {
  let group = section.groups.find(g => g.title === title);
  if (!group) {
    group = { title, questions: [] };
    section.groups.push(group);
  }
  return group;
};



const qEnsureQuestion = (group, prompt) => {
  let question = group.questions.find(q => q.prompt === prompt);
  if (!question) {
    question = { prompt, answers: [] };
    group.questions.push(question);
  }
  return question;
};

const qNorm = (value) => qText(value).toLowerCase().replace(/ё/g, "е");

const qPickScore = (question) => {
  const nums = [];
  let hasTextual = false;
  for (const ans of question?.answers || []) {
    const s = String(ans).trim().replace(",", ".");
    if (/^\d+(?:\.\d+)?$/.test(s)) {
      const n = +s;
      if (n >= 1 && n <= 10) nums.push(n);
      else hasTextual = true;
    } else if (s) {
      hasTextual = true;
    }
  }
  if (!nums.length || hasTextual) return null;
  return Math.max(...nums);
};

const qPickPercentScore = (question) => {
  for (const ans of question?.answers || []) {
    const s = qText(ans).replace(",", ".");
    let m = s.match(/^(\d+(?:\.\d+)?)\s*%$/);
    if (!m) m = s.match(/^(\d+(?:\.\d+)?)$/);
    if (!m) continue;
    const n = +m[1];
    if (n >= 0 && n <= 100) return n;
  }
  return null;
};

const qLooksLikePromptText = (value) => {
  const t = qNorm(value);
  if (!t) return false;
  return /^как\s/.test(t) || /^оцените/.test(t) || /^уровень/.test(t) || /^отход/.test(t) || /^проявлен/.test(t);
};

const qAppendUnique = (obj, key, value) => {
  if (value == null || value === "") return;
  const cur = obj[key] ? String(obj[key]).split(/\s*,\s*|\n+/).map(s => s.trim()).filter(Boolean) : [];
  const incoming = String(value).split(/\s*,\s*|\n+/).map(s => s.trim()).filter(Boolean);
  const merged = [...cur];
  incoming.forEach(v => { if (!merged.includes(v)) merged.push(v); });
  obj[key] = merged.join(", ");
};

const qAppendComment = (obj, value) => {
  if (value == null || value === "") return;
  const cur = obj.comments ? String(obj.comments).trim() : "";
  obj.comments = cur ? `${cur}\n${String(value).trim()}` : String(value).trim();
};

const qAssignField = (obj, key, value) => {
  if (value == null || value === "") return;
  if (key === "score") {
    obj[key] = value;
    return;
  }
  qAppendUnique(obj, key, value);
};

const qSetMaxNumber = (obj, key, value) => {
  if (!Number.isFinite(value)) return;
  if (obj[key] == null || !Number.isFinite(+obj[key]) || value > +obj[key]) obj[key] = value;
};

const qFmtAnswers = (answers=[]) => answers.filter(Boolean).join(", ");
const qHasPercent = (value) => /\d+(?:[.,]\d+)?\s*%/.test(qText(value));
const qSplitCsv = (value) => qText(value).split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);

const qExtractWellbeingNormalizedFromRaw = (raw) => {
  const out = { energy: {}, anxiety: {}, mood: {}, sleep: {}, focus: {} };

  let start = -1;
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c0 = qNorm(qCell(qRow(raw, i), 0));
    if (start === -1 && c0 === "самочувствие") {
      start = i;
      continue;
    }
    if (start !== -1 && i > start && QUESTIONNAIRE_SECTION_TITLES.has(qText(qCell(qRow(raw, i), 0)))) {
      end = i;
      break;
    }
  }
  if (start === -1) return out;

  let active = null;
  let promptByZone = {};
  let promptAnchors = [];
  const applyByPrompt = (key, prompt, answer) => {
    if (!key || !answer) return;
    const p = qNorm(prompt);
    if (/пик энергии/.test(p)) qAppendUnique(out[key], "peak", answer);
    else if (/как часто/.test(p)) qAppendUnique(out[key], "frequency", answer);
    else if (/как давно/.test(p)) qAppendUnique(out[key], "duration", answer);
    else if (/проявлен/.test(p)) qAppendUnique(out[key], "manifestation", answer);
    else if (/какое у вас настроение/.test(p)) qAppendUnique(out[key], "manifestation", answer);
    else if (/как спите/.test(p)) qAppendUnique(out[key], "quality", answer);
    else if (/отход ко сну|лож|засып/.test(p)) qAppendUnique(out[key], "bedtime", answer);
    else if (/оцените качество/.test(p)) qAppendUnique(out[key], "quality", answer);
    else qAppendUnique(out[key], "manifestation", answer);
  };
  const resolveWellbeingKeyByPrompt = (prompt, answer, fallbackKey) => {
    const p = qNorm(prompt);
    if (/пик энергии/.test(p)) return "energy";
    if (/проявлен/.test(p)) return "anxiety";
    if (/какое у вас настроение/.test(p)) return "mood";
    if (/как спите|отход ко сну|засып/.test(p)) return "sleep";
    if (/оцените качество/.test(p)) return "focus";
    if (/как часто|как давно/.test(p)) return fallbackKey;

    const a = qNorm(answer);
    if (/отлич|снижен|апат|раздраж|депресс|смена настроен/.test(a)) return "mood";
    if (/хорошо|сложно заснуть|частые пробужд|нет энергии после сна|до \d|после \d|около \d/.test(a)) return "sleep";
    if (/проявля.*стресс/.test(a)) return "anxiety";
    if (/пик.*утром|пик.*днем|пик.*вечером/.test(a)) return "energy";
    if (/сосредоточ|туман в голове|памят/.test(a)) return "focus";

    return fallbackKey;
  };

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (joined.includes("уровень энергии")) active = "energy";
    else if (joined.includes("тревожность")) active = "anxiety";
    else if (joined.includes("настроение")) active = "mood";
    else if (joined.includes("качество сна")) active = "sleep";
    else if (joined.includes("концентрация и память")) active = "focus";

    if (/комментарий.*самочувств/.test(joined)) {
      const next = qRowTexts(qRow(raw, r + 1)).join(" ");
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/пик энергии у вас|как часто|как давно длится|проявление|какое у вас настроение|как спите|отход ко сну|оцените качество/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || !active) return;
      const fallbackKey = active;
      if (/^\d{1,2}$/.test(ans)) {
        const n = +ans;
        if (n >= 1 && n <= 10) qSetMaxNumber(out[fallbackKey], "score", n);
        return;
      }
      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }
      const targetKey = resolveWellbeingKeyByPrompt(prompt, ans, fallbackKey) || fallbackKey;
      applyByPrompt(targetKey, prompt, ans);
    });
  }
  return out;
};

const qExtractAppearanceNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    skinState: "",
    skinRash: "",
    skinRashFrequency: "",
    edema: "",
    edemaFrequency: "",
    hair: "",
    nails: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c0 = qText(qCell(qRow(raw, i), 0));
    if (start === -1 && qNorm(c0) === "внешний вид") {
      start = i;
      continue;
    }
    if (start !== -1 && i > start && c0 && QUESTIONNAIRE_SECTION_TITLES.has(c0)) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendAppearanceValue = (key, value) => {
    if (!key || !value) return;
    qAppendUnique(out, key, value);
  };

  let activeTopic = "skinState";
  let promptByZone = {};
  let promptAnchors = [];
  let lastFrequencyTopic = "skinRash";

  const resolveAppearanceKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/состояние кожи/.test(p)) return "skinState";
    if (/высып/.test(p)) return "skinRash";
    if (/отек|отёк/.test(p)) return "edema";
    if (/волос/.test(p)) return "hair";
    if (/ногт/.test(p)) return "nails";
    if (/как часто/.test(p)) {
      if (fallbackTopic === "edema") return "edemaFrequency";
      if (fallbackTopic === "hair" || fallbackTopic === "nails") return fallbackTopic;
      return "skinRashFrequency";
    }
    return fallbackTopic || "skinState";
  };

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /внешн/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if (joined.includes("состояние кожи")) activeTopic = "skinState";
    else if (joined.includes("высып")) {
      activeTopic = "skinRash";
      lastFrequencyTopic = "skinRash";
    } else if (joined.includes("отек") || joined.includes("отёк")) {
      activeTopic = "edema";
      lastFrequencyTopic = "edema";
    } else if (joined.includes("волос")) activeTopic = "hair";
    else if (joined.includes("ногт")) activeTopic = "nails";

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/состояние кожи|высып|отек|отёк|волос|ногт|как часто/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;
      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }

      let baseTopic = activeTopic;
      if (/как часто/.test(qNorm(prompt))) {
        baseTopic = lastFrequencyTopic === "edema" ? "edema" : "skinRash";
      }

      let target = resolveAppearanceKeyByPrompt(prompt, baseTopic);
      if (target === "skinRash" || target === "skinRashFrequency") lastFrequencyTopic = "skinRash";
      if (target === "edema" || target === "edemaFrequency") lastFrequencyTopic = "edema";

      if (target === "skinRash" && /часто|редко|постоянно|иногда|ежедневно/i.test(ans) && /как часто/.test(qNorm(prompt))) {
        target = "skinRashFrequency";
      }
      if (target === "edema" && /часто|редко|постоянно|иногда|ежедневно/i.test(ans) && /как часто/.test(qNorm(prompt))) {
        target = "edemaFrequency";
      }

      appendAppearanceValue(target, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["skinState", "skinRash", "skinRashFrequency", "edema", "edemaFrequency", "hair", "nails", "comments"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractDigestionNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    afterMealSensation: "",
    afterMealDuration: "",
    tongueState: "",
    breathOdor: "",
    stool: "",
    stoolFrequency: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c0 = qText(qCell(qRow(raw, i), 0));
    if (start === -1 && qNorm(c0) === "пищеварение") {
      start = i;
      continue;
    }
    if (start !== -1 && i > start && c0 && QUESTIONNAIRE_SECTION_TITLES.has(c0)) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendDigestionValue = (key, value) => {
    if (!key || !value) return;
    qAppendUnique(out, key, value);
  };

  const resolveDigestionKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/ощущен.*после еды|после еды/.test(p)) return "afterMealSensation";
    if (/состояние языка|язык/.test(p)) return "tongueState";
    if (/запах.*рта|изо рта/.test(p)) return "breathOdor";
    if (/стул/.test(p)) return "stool";
    if (/как давно/.test(p)) return "afterMealDuration";
    if (/как часто|частота/.test(p)) {
      if (fallbackTopic === "stool") return "stoolFrequency";
      return "afterMealDuration";
    }
    return fallbackTopic || "afterMealSensation";
  };

  let activeTopic = "afterMealSensation";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /пищевар/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if (joined.includes("ощущение после еды") || joined.includes("ощущения после еды") || joined.includes("после еды")) activeTopic = "afterMealSensation";
    else if (joined.includes("состояние языка") || joined.includes("язык")) activeTopic = "tongueState";
    else if (joined.includes("запах из рта") || joined.includes("изо рта")) activeTopic = "breathOdor";
    else if (joined.includes("стул")) activeTopic = "stool";

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/ощущен.*после еды|после еды|как давно|состояние языка|язык|запах.*рта|изо рта|стул|как часто|частота/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }

      let target = resolveDigestionKeyByPrompt(prompt, activeTopic);
      if (target === "afterMealSensation" && /как давно/.test(qNorm(prompt))) target = "afterMealDuration";
      if (target === "stool" && (/как часто|частота/.test(qNorm(prompt)) || /ежеднев|редко|часто|раз в/i.test(ans))) target = "stoolFrequency";

      appendDigestionValue(target, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["afterMealSensation", "afterMealDuration", "tongueState", "breathOdor", "stool", "stoolFrequency", "comments"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractFemaleHealthNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    cycle: "",
    pms: "",
    pmsTiming: "",
    pmsFrequency: "",
    pmsDuration: "",
    duringMenstruation: "",
    pain: "",
    flow: "",
    discharge: "",
    thrush: "",
    contraception: "",
    breastfeeding: "",
    libido: "",
    gynecologistVisitFrequency: "",
    lastGynecologistVisitDate: "",
    lastBreastUltrasoundDate: "",
    gynecologyDiagnoses: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c0 = qText(qCell(qRow(raw, i), 0));
    if (start === -1 && qNorm(c0) === "женское здоровье") {
      start = i;
      continue;
    }
    if (start !== -1 && i > start && c0 && QUESTIONNAIRE_SECTION_TITLES.has(c0)) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const femaleFields = new Set(Object.keys(out));

  const appendFemaleValue = (key, value) => {
    if (!key || !femaleFields.has(key) || !value) return;
    qAppendUnique(out, key, value);
  };

  const resolveFemaleKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/менструальн.*цикл/.test(p)) return "cycle";
    if (/перед менструац/.test(p)) return "pms";
    if (/за сколько.*до.*менструац/.test(p)) return "pmsTiming";
    if (/как часто/.test(p)) {
      if ((fallbackTopic || "").startsWith("pms")) return "pmsFrequency";
      if (fallbackTopic === "gynecologistVisitFrequency") return "gynecologistVisitFrequency";
    }
    if (/как давно.*длит|как долго.*длит/.test(p)) {
      if ((fallbackTopic || "").startsWith("pms")) return "pmsDuration";
    }
    if (/во время менструац/.test(p)) return "duringMenstruation";
    if (/болезнен/.test(p)) return "pain";
    if (/обильност/.test(p)) return "flow";
    if (/необычн.*выделен/.test(p)) return "discharge";
    if (/молочниц/.test(p)) return "thrush";
    if (/контрацеп/.test(p)) return "contraception";
    if (/кормлен.*груд/.test(p)) return "breastfeeding";
    if (/либидо/.test(p)) return "libido";
    if (/частота посещения гинеколог/.test(p)) return "gynecologistVisitFrequency";
    if (/дата последнего посещения/.test(p)) return "lastGynecologistVisitDate";
    if (/узи молочн.*желез/.test(p)) return "lastBreastUltrasoundDate";
    if (/диагноз.*гинеколог/.test(p)) return "gynecologyDiagnoses";
    if (fallbackTopic && femaleFields.has(fallbackTopic)) return fallbackTopic;
    return "cycle";
  };

  const topicByJoined = (joined, current) => {
    if (joined.includes("менструальный цикл")) return "cycle";
    if (joined.includes("перед менструа")) return "pms";
    if (joined.includes("за сколько") && joined.includes("менструац")) return "pmsTiming";
    if (joined.includes("как часто")) {
      if (joined.includes("гинеколог")) return "gynecologistVisitFrequency";
      if ((current || "").startsWith("pms")) return "pmsFrequency";
    }
    if (joined.includes("как долго длится") || joined.includes("как давно длится")) {
      if ((current || "").startsWith("pms")) return "pmsDuration";
    }
    if (joined.includes("во время менструац")) return "duringMenstruation";
    if (joined.includes("болезнен")) return "pain";
    if (joined.includes("обильност")) return "flow";
    if (joined.includes("необычн") && joined.includes("выделен")) return "discharge";
    if (joined.includes("молочниц")) return "thrush";
    if (joined.includes("контрацеп")) return "contraception";
    if (joined.includes("кормление груд")) return "breastfeeding";
    if (joined.includes("либидо")) return "libido";
    if (joined.includes("частота посещения гинеколог")) return "gynecologistVisitFrequency";
    if (joined.includes("дата последнего посещения")) return "lastGynecologistVisitDate";
    if (joined.includes("узи молочных желез")) return "lastBreastUltrasoundDate";
    if (joined.includes("диагноз") && joined.includes("гинеколог")) return "gynecologyDiagnoses";
    return current;
  };

  const extractTextValueForPrompt = (rowTexts, promptRegex) => {
    const values = rowTexts.filter(t => !promptRegex.test(qNorm(t)));
    return values.join(" ").trim();
  };

  let activeTopic = "cycle";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /жен/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    activeTopic = topicByJoined(joined, activeTopic);

    if (/дата последнего посещения/.test(joined)) {
      const val = extractTextValueForPrompt(rowTexts, /дата последнего посещения/i);
      if (val) appendFemaleValue("lastGynecologistVisitDate", val);
      continue;
    }
    if (/узи молочн.*желез/.test(joined)) {
      const val = extractTextValueForPrompt(rowTexts, /дата последнего узи молочн.*желез/i);
      if (val) appendFemaleValue("lastBreastUltrasoundDate", val);
      continue;
    }
    if (/диагноз.*гинеколог/.test(joined)) {
      const val = extractTextValueForPrompt(rowTexts, /имеющ.*диагноз.*гинеколог/i);
      if (val) appendFemaleValue("gynecologyDiagnoses", val);
      const next = qRowTexts(qRow(raw, r + 1)).join(" ").trim();
      if (next && !/комментарий|уровень стресса|вредные привычки|анам(?:е|н)з/.test(qNorm(next))) {
        appendFemaleValue("gynecologyDiagnoses", next);
      }
      continue;
    }

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/менструальн.*цикл|перед менструац|за сколько.*до.*менструац|как часто|как долго.*длит|как давно.*длит|во время менструац|болезнен|обильност|необычн.*выделен|молочниц|контрацеп|кормлен.*груд|либидо|частота посещения гинеколог|дата последнего посещения|узи молочн.*желез|диагноз.*гинеколог/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }

      const target = resolveFemaleKeyByPrompt(prompt, activeTopic);
      appendFemaleValue(target, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set([
      "cycle",
      "pms",
      "pmsTiming",
      "pmsFrequency",
      "pmsDuration",
      "duringMenstruation",
      "pain",
      "flow",
      "discharge",
      "thrush",
      "contraception",
      "breastfeeding",
      "libido",
      "gynecologistVisitFrequency",
      "lastGynecologistVisitDate",
      "lastBreastUltrasoundDate",
      "gynecologyDiagnoses",
      "comments"
    ]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractMaleHealthNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    libido: "",
    potency: "",
    painUrination: "",
    weakStream: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c0 = qText(qCell(qRow(raw, i), 0));
    if (start === -1 && qNorm(c0) === "мужское здоровье") {
      start = i;
      continue;
    }
    if (start !== -1 && i > start && c0 && QUESTIONNAIRE_SECTION_TITLES.has(c0)) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendMaleValue = (key, value) => {
    if (!key || !value) return;
    qAppendUnique(out, key, value);
  };

  const resolveMaleKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/либидо/.test(p)) return "libido";
    if (/потенц/.test(p)) return "potency";
    if (/боль.*мочеиспуск/.test(p)) return "painUrination";
    if (/вял.*стру/.test(p)) return "weakStream";
    return fallbackTopic || "libido";
  };

  let activeTopic = "libido";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /муж/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if (joined.includes("либидо")) activeTopic = "libido";
    else if (joined.includes("потенц")) activeTopic = "potency";
    else if (joined.includes("боль") && joined.includes("мочеиспуск")) activeTopic = "painUrination";
    else if (joined.includes("вял") && joined.includes("стру")) activeTopic = "weakStream";

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/либидо|потенц|боль.*мочеиспуск|вял.*стру/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }

      const target = resolveMaleKeyByPrompt(prompt, activeTopic);
      appendMaleValue(target, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["libido", "potency", "painUrination", "weakStream", "comments"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractRespiratoryNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    breathingIssue: "",
    breathingIssueFrequency: "",
    cough: "",
    smoking: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c0 = qText(qCell(qRow(raw, i), 0));
    if (start === -1 && qNorm(c0) === "дыхательная система") {
      start = i;
      continue;
    }
    if (start !== -1 && i > start && c0 && QUESTIONNAIRE_SECTION_TITLES.has(c0)) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendRespValue = (key, value) => {
    if (!key || !value) return;
    qAppendUnique(out, key, value);
  };

  const resolveRespKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/нарушен.*дыхан|дыхан/.test(p)) return "breathingIssue";
    if (/как часто/.test(p)) return "breathingIssueFrequency";
    if (/кашел/.test(p)) return "cough";
    if (/вы курите|курит/.test(p)) return "smoking";
    return fallbackTopic || "breathingIssue";
  };

  let activeTopic = "breathingIssue";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /дыхат/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if (joined.includes("нарушение дыхания") || joined.includes("дыхания")) activeTopic = "breathingIssue";
    else if (joined.includes("кашел")) activeTopic = "cough";
    else if (joined.includes("вы курите") || joined.includes("курит")) activeTopic = "smoking";

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/нарушен.*дыхан|дыхан|как часто|кашел|вы курите|курит/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }

      let target = resolveRespKeyByPrompt(prompt, activeTopic);
      if (target === "breathingIssue" && /как часто/.test(qNorm(prompt))) target = "breathingIssueFrequency";
      appendRespValue(target, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["breathingIssue", "breathingIssueFrequency", "cough", "smoking", "comments"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractCardioNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    bloodPressure: "",
    arrhythmia: "",
    heartPain: "",
    heartPainTriggers: "",
    heartPainFrequency: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c0 = qText(qCell(qRow(raw, i), 0));
    if (start === -1 && qNorm(c0) === "сердечно-сосудистая система") {
      start = i;
      continue;
    }
    if (start !== -1 && i > start && c0 && QUESTIONNAIRE_SECTION_TITLES.has(c0)) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendCardioValue = (key, value) => {
    if (!key || !value) return;
    qAppendUnique(out, key, value);
  };

  const resolveCardioKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/артериал.*давлен|давлен/.test(p)) return "bloodPressure";
    if (/нарушен.*ритм|ритм/.test(p)) return "arrhythmia";
    if (/боли?.*сердц|боль.*сердц/.test(p)) return "heartPain";
    if (/после чего усилива/.test(p)) return "heartPainTriggers";
    if (/как часто/.test(p)) return "heartPainFrequency";
    return fallbackTopic || "bloodPressure";
  };

  let activeTopic = "bloodPressure";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /сердечно|сосуд/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if (joined.includes("артериальное давление") || joined.includes("давление")) activeTopic = "bloodPressure";
    else if (joined.includes("нарушение ритма") || joined.includes("ритм")) activeTopic = "arrhythmia";
    else if ((joined.includes("боли") || joined.includes("боль")) && joined.includes("серд")) activeTopic = "heartPain";

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/артериал.*давлен|давлен|нарушен.*ритм|ритм|боли?.*сердц|боль.*сердц|после чего усилива|как часто/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }

      let target = resolveCardioKeyByPrompt(prompt, activeTopic);
      if (target === "heartPain" && /после чего усилива/.test(qNorm(prompt))) target = "heartPainTriggers";
      if (target === "heartPain" && /как часто/.test(qNorm(prompt))) target = "heartPainFrequency";
      appendCardioValue(target, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["bloodPressure", "arrhythmia", "heartPain", "heartPainTriggers", "heartPainFrequency", "comments"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractMusculoskeletalNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    neckBackLowerBackDiscomfort: "",
    neckBackLowerBackFrequency: "",
    muscleDiscomfort: "",
    jointDiscomfort: "",
    jointManifestation: "",
    jointFrequency: "",
    legEdema: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c0 = qText(qCell(qRow(raw, i), 0));
    if (start === -1 && qNorm(c0) === "скелетно-мышечная система") {
      start = i;
      continue;
    }
    if (start !== -1 && i > start && c0 && QUESTIONNAIRE_SECTION_TITLES.has(c0)) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendMusculoskeletalValue = (key, value) => {
    if (!key || !value) return;
    qAppendUnique(out, key, value);
  };

  const resolveMusculoskeletalKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/шее|спине|поясниц|дискомфорт.*(шее|спине|поясниц)/.test(p)) return "neckBackLowerBackDiscomfort";
    if (/дискомфорт.*мышц|мышц/.test(p)) return "muscleDiscomfort";
    if (/дискомфорт.*сустав|сустав/.test(p)) return "jointDiscomfort";
    if (/как проявля/.test(p)) return "jointManifestation";
    if (/как часто/.test(p)) {
      if (fallbackTopic === "jointDiscomfort" || fallbackTopic === "jointManifestation" || fallbackTopic === "jointFrequency") return "jointFrequency";
      return "neckBackLowerBackFrequency";
    }
    if (/отек.*ног|отёк.*ног/.test(p)) return "legEdema";
    return fallbackTopic || "neckBackLowerBackDiscomfort";
  };

  let activeTopic = "neckBackLowerBackDiscomfort";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /скелет|мышеч|сустав/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if ((joined.includes("дискомфорт") && (joined.includes("шее") || joined.includes("спине") || joined.includes("пояснице"))) || joined.includes("шее, спине, пояснице")) {
      activeTopic = "neckBackLowerBackDiscomfort";
    } else if (joined.includes("дискомфорт в мышцах") || (joined.includes("дискомфорт") && joined.includes("мышц"))) {
      activeTopic = "muscleDiscomfort";
    } else if (joined.includes("дискомфорт в суставах") || (joined.includes("дискомфорт") && joined.includes("сустав"))) {
      activeTopic = "jointDiscomfort";
    } else if (joined.includes("отеки ног") || joined.includes("отеки ног") || joined.includes("отек ног") || joined.includes("отёк ног")) {
      activeTopic = "legEdema";
    }

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/шее|спине|поясниц|дискомфорт.*мышц|дискомфорт.*сустав|сустав|как проявля|как часто|отек.*ног|отёк.*ног/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }

      let target = resolveMusculoskeletalKeyByPrompt(prompt, activeTopic);
      if (target === "jointDiscomfort" && /как проявля/.test(qNorm(prompt))) target = "jointManifestation";
      if (target === "jointDiscomfort" && /как часто/.test(qNorm(prompt))) target = "jointFrequency";
      if (target === "neckBackLowerBackDiscomfort" && /как часто/.test(qNorm(prompt))) target = "neckBackLowerBackFrequency";

      appendMusculoskeletalValue(target, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set([
      "neckBackLowerBackDiscomfort",
      "neckBackLowerBackFrequency",
      "muscleDiscomfort",
      "jointDiscomfort",
      "jointManifestation",
      "jointFrequency",
      "legEdema",
      "comments"
    ]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractImmuneNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    coldViral: "",
    covid19: "",
    postCovidChanges: "",
    herpes: "",
    allergy: "",
    allergyDuration: "",
    autoimmune: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c0 = qNorm(qText(qCell(qRow(raw, i), 0)));
    if (start === -1 && (c0 === "имунная система" || c0 === "иммунная система")) {
      start = i;
      continue;
    }
    if (start !== -1 && i > start && qText(qCell(qRow(raw, i), 0)) && QUESTIONNAIRE_SECTION_TITLES.has(qText(qCell(qRow(raw, i), 0)))) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendImmuneValue = (key, value) => {
    if (!key || !value) return;
    qAppendUnique(out, key, value);
  };

  const resolveImmuneKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/простуд|вирус/.test(p)) return "coldViral";
    if (/covid|ковид/.test(p)) return "covid19";
    if (/какие изменения.*после|изменения.*самочувств.*после/.test(p)) return "postCovidChanges";
    if (/герпес/.test(p)) return "herpes";
    if (/аллерг/.test(p)) return "allergy";
    if (/как давно/.test(p)) {
      if (fallbackTopic === "allergy" || fallbackTopic === "allergyDuration") return "allergyDuration";
      return "postCovidChanges";
    }
    if (/аутоимун|аутоиммун/.test(p)) return "autoimmune";
    return fallbackTopic || "coldViral";
  };

  let activeTopic = "coldViral";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /имун|иммун/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if (joined.includes("простуд") || joined.includes("вирус")) activeTopic = "coldViral";
    else if (joined.includes("covid") || joined.includes("ковид")) activeTopic = "covid19";
    else if (joined.includes("какие изменения") && joined.includes("после")) activeTopic = "postCovidChanges";
    else if (joined.includes("герпес")) activeTopic = "herpes";
    else if (joined.includes("аллерг")) activeTopic = "allergy";
    else if (joined.includes("аутоимун") || joined.includes("аутоиммун")) activeTopic = "autoimmune";

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/простуд|вирус|covid|ковид|какие изменения.*после|изменения.*самочувств.*после|герпес|аллерг|как давно|аутоимун|аутоиммун/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }

      let target = resolveImmuneKeyByPrompt(prompt, activeTopic);
      if (target === "covid19" && /какие изменения.*после|изменения.*самочувств.*после/.test(qNorm(prompt))) target = "postCovidChanges";
      if (target === "allergy" && /как давно/.test(qNorm(prompt))) target = "allergyDuration";
      appendImmuneValue(target, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["coldViral", "covid19", "postCovidChanges", "herpes", "allergy", "allergyDuration", "autoimmune", "comments"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractActivityNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    activityType: "",
    regularity: "",
    sessionDuration: "",
    fitnessTolerance: "",
    dailyActivity: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  const isSectionTitleText = (txt) => {
    const t = qText(txt);
    return !!t && QUESTIONNAIRE_SECTION_TITLES.has(t);
  };
  const activityStarts = [];
  for (let i = 0; i < raw.length; i++) {
    const rowTexts = qRowTexts(qRow(raw, i));
    const rowNorm = rowTexts.map(qNorm);
    if (rowNorm.includes("физическая активность")) activityStarts.push(i);
  }
  if (activityStarts.length) start = activityStarts[activityStarts.length - 1];

  for (let i = Math.max(0, start + 1); i < raw.length; i++) {
    const rowTexts = qRowTexts(qRow(raw, i));
    const rowNorm = rowTexts.map(qNorm);
    if (start !== -1 && i > start && rowTexts.some(isSectionTitleText) && !rowNorm.includes("физическая активность")) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendActivityValue = (key, value) => {
    if (!key || !value) return;
    qAppendUnique(out, key, value);
  };

  const resolveActivityKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/вид.*физ.*актив/.test(p)) return "activityType";
    if (/регулярност/.test(p)) return "regularity";
    if (/длительност.*занят/.test(p)) return "sessionDuration";
    if (/переносимост.*фитнес|переносимост/.test(p)) return "fitnessTolerance";
    if (/ежедневн.*актив/.test(p) || /шагов/.test(p)) return "dailyActivity";
    return fallbackTopic || "activityType";
  };

  let activeTopic = "activityType";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /физическ.*актив/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if (joined.includes("вид физической активности")) activeTopic = "activityType";
    else if (joined.includes("регулярность")) activeTopic = "regularity";
    else if (joined.includes("длительность занятий")) activeTopic = "sessionDuration";
    else if (joined.includes("переносимость фитнеса")) activeTopic = "fitnessTolerance";
    else if (joined.includes("ежедневная активность")) activeTopic = "dailyActivity";

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/вид.*физ.*актив|регулярност|длительност.*занят|переносимост.*фитнес|переносимост|ежедневн.*актив/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }

      const target = resolveActivityKeyByPrompt(prompt, activeTopic);
      appendActivityValue(target, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["activityType", "regularity", "sessionDuration", "fitnessTolerance", "dailyActivity", "comments"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractStressNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    level: null,
    sources: "",
    duration: "",
    coping: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  const isSectionTitleText = (txt) => {
    const t = qText(txt);
    return !!t && QUESTIONNAIRE_SECTION_TITLES.has(t);
  };
  const stressStarts = [];
  for (let i = 0; i < raw.length; i++) {
    const rowTexts = qRowTexts(qRow(raw, i));
    const rowNorm = rowTexts.map(qNorm);
    if (rowNorm.includes("уровень стресса")) stressStarts.push(i);
  }
  if (stressStarts.length) start = stressStarts[stressStarts.length - 1];

  for (let i = Math.max(0, start + 1); i < raw.length; i++) {
    const rowTexts = qRowTexts(qRow(raw, i));
    const rowNorm = rowTexts.map(qNorm);
    if (start !== -1 && i > start && rowTexts.some(isSectionTitleText) && !rowNorm.includes("уровень стресса")) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const parseStressPercent = (value) => {
    const s = qText(value).replace(",", ".").trim();
    if (!s) return null;
    const mPct = s.match(/(\d+(?:\.\d+)?)\s*%/);
    if (mPct) {
      const n = +mPct[1];
      if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
      return null;
    }
    const mNum = s.match(/-?\d+(?:\.\d+)?/);
    if (!mNum) return null;
    const n = +mNum[0];
    if (!Number.isFinite(n)) return null;
    if (n >= 0 && n <= 1) return Math.max(0, Math.min(100, n * 100));
    if (n >= 0 && n <= 100) return Math.max(0, Math.min(100, n));
    return null;
  };

  const appendStressValue = (key, value) => {
    if (!key || !value) return;
    if (key === "level") {
      const pct = parseStressPercent(value);
      if (pct == null) return;
      if (out.level == null || pct > out.level) out.level = pct;
      return;
    }
    qAppendUnique(out, key, value);
  };

  const resolveStressKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/оцените.*уровень.*стресс|уровень стрес/.test(p)) return "level";
    if (/источник.*стресс|что вызывает/.test(p)) return "sources";
    if (/длительност.*стресс/.test(p)) return "duration";
    if (/работа.*стресс|как справ|справля/.test(p)) return "coping";
    return fallbackTopic || "sources";
  };

  let activeTopic = "level";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /стресс/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if (joined.includes("оцените свой уровень стресса") || joined.includes("уровень стресса")) activeTopic = "level";
    else if (joined.includes("источники стресса")) activeTopic = "sources";
    else if (joined.includes("длительность стресса")) activeTopic = "duration";
    else if (joined.includes("работа со стрессом")) activeTopic = "coping";

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/оцените.*уровень.*стресс|уровень стрес|источник.*стресс|длительност.*стресс|работа.*стресс|как справ|справля/.test(t)) {
        newPromptAnchors.push({ idx, prompt: qText(cell) });
      }
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }

      const target = resolveStressKeyByPrompt(prompt, activeTopic);
      appendStressValue(target, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["level", "sources", "duration", "coping", "comments"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (k === "level") {
        const pct = parseStressPercent(v);
        if (pct != null && (out.level == null || pct > out.level)) out.level = pct;
        return;
      }
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractHabitsNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    alcohol: "",
    alcoholDrinks: "",
    stimulants: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  const isSectionTitleText = (txt) => {
    const t = qText(txt);
    return !!t && QUESTIONNAIRE_SECTION_TITLES.has(t);
  };
  const starts = [];
  for (let i = 0; i < raw.length; i++) {
    const rowTexts = qRowTexts(qRow(raw, i));
    const rowNorm = rowTexts.map(qNorm);
    if (rowNorm.includes("вредные привычки")) starts.push(i);
  }
  if (starts.length) start = starts[starts.length - 1];

  for (let i = Math.max(0, start + 1); i < raw.length; i++) {
    const rowTexts = qRowTexts(qRow(raw, i));
    const rowNorm = rowTexts.map(qNorm);
    if (start !== -1 && i > start && rowTexts.some(isSectionTitleText) && !rowNorm.includes("вредные привычки")) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendValue = (key, value) => {
    if (!key || !value) return;
    qAppendUnique(out, key, value);
  };

  const resolveKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/алкогол/.test(p)) return "alcohol";
    if (/какие напитки употребляете|какие напитки/.test(p)) return "alcoholDrinks";
    if (/стимулятор/.test(p)) return "stimulants";
    return fallbackTopic || "alcohol";
  };

  let activeTopic = "alcohol";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /вредн.*привыч/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if (joined.includes("алкоголь")) activeTopic = "alcohol";
    else if (joined.includes("какие напитки")) activeTopic = "alcoholDrinks";
    else if (joined.includes("стимулятор")) activeTopic = "stimulants";

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/алкогол|какие напитки|стимулятор/.test(t)) newPromptAnchors.push({ idx, prompt: qText(cell) });
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }
      appendValue(resolveKeyByPrompt(prompt, activeTopic), ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["alcohol", "alcoholDrinks", "stimulants", "comments"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractAnamnesNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    chronicDiseases: "",
    oncology: "",
    surgeriesTrauma: "",
    severeInfections: "",
    checkups: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  const isSectionTitleText = (txt) => {
    const t = qText(txt);
    return !!t && QUESTIONNAIRE_SECTION_TITLES.has(t);
  };
  const starts = [];
  for (let i = 0; i < raw.length; i++) {
    const rowTexts = qRowTexts(qRow(raw, i));
    const rowNorm = rowTexts.map(qNorm);
    if (rowNorm.includes("анамез") || rowNorm.includes("анамнез")) starts.push(i);
  }
  if (starts.length) start = starts[starts.length - 1];

  for (let i = Math.max(0, start + 1); i < raw.length; i++) {
    const rowTexts = qRowTexts(qRow(raw, i));
    const rowNorm = rowTexts.map(qNorm);
    if (start !== -1 && i > start && rowTexts.some(isSectionTitleText) && !rowNorm.includes("анамез") && !rowNorm.includes("анамнез")) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendValue = (key, value) => {
    if (!key || !value) return;
    qAppendUnique(out, key, value);
  };

  const resolveKeyByPrompt = (prompt, fallbackTopic) => {
    const p = qNorm(prompt);
    if (/хронич/.test(p)) return "chronicDiseases";
    if (/онколог/.test(p)) return "oncology";
    if (/операц|тяжел.*травм/.test(p)) return "surgeriesTrauma";
    if (/тяжел.*инфекц/.test(p)) return "severeInfections";
    if (/обследован/.test(p)) return "checkups";
    return fallbackTopic || "chronicDiseases";
  };

  let activeTopic = "chronicDiseases";
  let promptByZone = {};
  let promptAnchors = [];

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /анам/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      if (rowComment) out.comments = out.comments ? `${out.comments}\n${rowComment}` : rowComment;
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) out.comments = out.comments ? `${out.comments}\n${next}` : next;
      continue;
    }

    if (joined.includes("хронические заболевания")) activeTopic = "chronicDiseases";
    else if (joined.includes("онкологические заболевания")) activeTopic = "oncology";
    else if (joined.includes("операции") || joined.includes("тяжелые травмы")) activeTopic = "surgeriesTrauma";
    else if (joined.includes("тяжелые инфекции")) activeTopic = "severeInfections";
    else if (joined.includes("обследования")) activeTopic = "checkups";

    const newPromptAnchors = [];
    row.forEach((cell, idx) => {
      const t = qNorm(cell);
      if (!t) return;
      if (/хронич|онколог|операц|тяжел.*травм|тяжел.*инфекц|обследован/.test(t)) newPromptAnchors.push({ idx, prompt: qText(cell) });
    });
    if (newPromptAnchors.length) {
      promptAnchors = newPromptAnchors;
      promptByZone = {};
      newPromptAnchors.forEach(({ idx, prompt }) => {
        const z = qZoneForIndex(idx);
        if (!promptByZone[z]) promptByZone[z] = prompt;
      });
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans || qLooksLikeScaleValue(ans)) return;

      let prompt = promptByZone[zone] || "";
      if (promptAnchors.length && Number.isFinite(col)) {
        const nearest = promptAnchors.reduce((best, cur) => {
          if (!best) return cur;
          return Math.abs(cur.idx - col) < Math.abs(best.idx - col) ? cur : best;
        }, null);
        if (nearest && Math.abs(nearest.idx - col) <= 4) prompt = nearest.prompt;
      }
      appendValue(resolveKeyByPrompt(prompt, activeTopic), ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["chronicDiseases", "oncology", "surgeriesTrauma", "severeInfections", "checkups", "comments", "chronic", "meds", "heredity"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const qExtractNutritionNormalizedFromRaw = (raw, fallback = null) => {
  const out = {
    healthyDietPercent: null,
    habitualDiet: "",
    foodReactionAllergy: "",
    cravings: "",
    cravingsDegree: "",
    sugarUse: "",
    sugarCoffeeTea: "",
    sugarSweetsDesserts: "",
    regularCarbs: "",
    proteinMain: "",
    proteinFrequency: "",
    redMeat: "",
    fishSeafood: "",
    proteinComments: "",
    fatsMain: "",
    fatsFrequency: "",
    friedFoodGolden: "",
    transFatsLabels: "",
    fatsData: "",
    fatsComments: "",
    fiberVegetables: "",
    fiberFruits: "",
    fiberTracking: "",
    fiberData: "",
    fiberComments: "",
    hydrationWaterAmount: "",
    hydrationOtherDrinks: "",
    hydrationCoffee: "",
    hydrationData: "",
    hydrationComments: "",
    mealMealsPerDay: "",
    mealSnacks: "",
    mealStressEating: "",
    mealBreakfast: "",
    mealBreakfastProducts: "",
    mealLunch: "",
    mealLunchWhereWorkdays: "",
    mealDinner: "",
    mealDinnerTime: "",
    mealDinnerComposition: "",
    mealRegimenData: "",
    mealRegimenComments: "",
    comments: ""
  };

  let start = -1;
  let end = raw.length;
  const isSectionTitleText = (txt) => {
    const t = qText(txt);
    return !!t && QUESTIONNAIRE_SECTION_TITLES.has(t);
  };
  const nutritionStarts = [];
  for (let i = 0; i < raw.length; i++) {
    const row = qRow(raw, i);
    const rowTexts = qRowTexts(row);
    const rowNorm = rowTexts.map(qNorm);
    if (rowNorm.includes("питание и пищевые привычки")) nutritionStarts.push(i);
  }
  if (nutritionStarts.length) start = nutritionStarts[nutritionStarts.length - 1];

  for (let i = Math.max(0, start + 1); i < raw.length; i++) {
    const row = qRow(raw, i);
    const rowTexts = qRowTexts(row);
    const rowNorm = rowTexts.map(qNorm);
    if (start !== -1 && i > start && rowTexts.some(isSectionTitleText) && !rowNorm.includes("питание и пищевые привычки")) {
      end = i;
      break;
    }
  }
  if (start === -1) return fallback && typeof fallback === "object" ? fallback : out;

  const appendNutritionValue = (key, value) => {
    if (!key || value == null || value === "") return;
    if (key === "healthyDietPercent") {
      const s = qText(value).replace(",", ".");
      const m = s.match(/(\d+(?:\.\d+)?)\s*%?/);
      if (!m) return;
      const n = +m[1];
      if (!Number.isFinite(n)) return;
      const pct = Math.max(0, Math.min(100, n));
      if (out.healthyDietPercent == null || pct > out.healthyDietPercent) out.healthyDietPercent = pct;
      return;
    }
    qAppendUnique(out, key, value);
  };

  const detectQuestionKey = (text) => {
    const p = qNorm(text);
    if (!p) return "";
    if (/насколько.*здоров.*рацион|на сколько.*здоров.*рацион|придерживаетесь здорового рациона|здорового рациона/.test(p)) return "healthyDietPercent";
    if (/ваш привычный рацион|привычный рацион/.test(p)) return "habitualDiet";
    if (/реакц.*на еду|аллерг/.test(p)) return "foodReactionAllergy";
    if (/есть ли тяга.*продукт/.test(p)) return "cravings";
    if (/степень тяги/.test(p)) return "cravingsDegree";
    if (/в кофе|в чае|в кофе, чае/.test(p)) return "sugarCoffeeTea";
    if (/сладости|десерт/.test(p)) return "sugarSweetsDesserts";
    if (/углевод.*регуляр/.test(p)) return "regularCarbs";

    if (/основн.*белок/.test(p)) return "proteinMain";
    if (/как часто.*белок|едите белок/.test(p)) return "proteinFrequency";
    if (/красное мясо/.test(p)) return "redMeat";
    if (/рыба и морепродукты|рыб.*морепродукт/.test(p)) return "fishSeafood";

    if (/основн.*жир/.test(p)) return "fatsMain";
    if (/как часто.*жир|едите жиры/.test(p)) return "fatsFrequency";
    if (/жарен.*золотист.*корочк/.test(p)) return "friedFoodGolden";
    if (/этикетк.*трансжир|трансжир/.test(p)) return "transFatsLabels";

    if (/овощи в рационе/.test(p)) return "fiberVegetables";
    if (/фрукты в рационе/.test(p)) return "fiberFruits";
    if (/следите.*клетчатк|количеств.*клетчатк/.test(p)) return "fiberTracking";

    if (/сколько.*чист.*воды|чистой воды/.test(p)) return "hydrationWaterAmount";
    if (/какие напитки.*в течени|какие напитки.*в течение/.test(p)) return "hydrationOtherDrinks";
    if (/^кофе$/.test(p)) return "hydrationCoffee";

    if (/сколько при[её]мов пищи/.test(p)) return "mealMealsPerDay";
    if (/^перекусы?$/.test(p)) return "mealSnacks";
    if (/заедаете.*стресс|заедаете.*устал/.test(p)) return "mealStressEating";
    if (/^завтрак$/.test(p)) return "mealBreakfast";
    if (/привычные продукты.*завтрак/.test(p)) return "mealBreakfastProducts";
    if (/^обед$/.test(p)) return "mealLunch";
    if (/где обедаете.*рабоч/.test(p)) return "mealLunchWhereWorkdays";
    if (/^ужин$/.test(p)) return "mealDinner";
    if (/время ужина/.test(p)) return "mealDinnerTime";
    if (/ужин.*состоит/.test(p)) return "mealDinnerComposition";

    return "";
  };

  const detectCommentTarget = (text, fallbackTarget = "comments") => {
    const p = qNorm(text);
    if (/белок/.test(p)) return "proteinComments";
    if (/жир/.test(p) || /трансжир/.test(p)) return "fatsComments";
    if (/овощ|фрукт|клетчат/.test(p)) return "fiberComments";
    if (/питьев|вода|напит|кофе/.test(p)) return "hydrationComments";
    if (/режим|пищев/.test(p)) return "mealRegimenComments";
    return fallbackTarget;
  };

  let currentQuestionKey = "";
  let currentCommentTarget = "comments";

  for (let r = start; r < end; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const joined = qNorm(rowTexts.join(" | "));

    if (/комментарий/.test(joined) && /питани|пищев|белок|жир|овощ|фрукт|клетчат|питьев|вода|режим|кофе/.test(joined)) {
      const rowComment = rowTexts.filter(t => !/^комментарий/i.test(t)).join(" ").trim();
      const target = detectCommentTarget(joined, currentCommentTarget);
      if (rowComment) {
        out[target] = out[target] ? `${out[target]}\n${rowComment}` : rowComment;
      }
      const next = qRowTexts(qRow(raw, r + 1))
        .filter(t => !/^комментарий/i.test(t))
        .join(" ")
        .trim();
      if (next) {
        out[target] = out[target] ? `${out[target]}\n${next}` : next;
      }
      continue;
    }

    const checked = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    const detectedInRow = (!checked.length || !currentQuestionKey)
      ? rowTexts.map(detectQuestionKey).find(Boolean)
      : "";
    if (detectedInRow) {
      currentQuestionKey = detectedInRow;
      currentCommentTarget = detectCommentTarget(rowTexts.join(" "), detectCommentTarget(currentQuestionKey, "comments"));
    }

    checked.forEach(({ zone, col, answer }) => {
      const ans = qText(answer);
      if (!ans) return;
      const key = currentQuestionKey || detectedInRow || "";
      if (!key) return;
      appendNutritionValue(key, ans);
    });
  }

  if (out.comments) {
    const lines = out.comments.split("\n").map(s => s.trim()).filter(Boolean);
    out.comments = [...new Set(lines)].join("\n");
  }
  if (out.proteinComments) {
    const lines = out.proteinComments.split("\n").map(s => s.trim()).filter(Boolean);
    out.proteinComments = [...new Set(lines)].join("\n");
  }
  if (out.fatsComments) out.fatsComments = [...new Set(out.fatsComments.split("\n").map(s => s.trim()).filter(Boolean))].join("\n");
  if (out.fiberComments) out.fiberComments = [...new Set(out.fiberComments.split("\n").map(s => s.trim()).filter(Boolean))].join("\n");
  if (out.hydrationComments) out.hydrationComments = [...new Set(out.hydrationComments.split("\n").map(s => s.trim()).filter(Boolean))].join("\n");
  if (out.mealRegimenComments) out.mealRegimenComments = [...new Set(out.mealRegimenComments.split("\n").map(s => s.trim()).filter(Boolean))].join("\n");
  if (fallback && typeof fallback === "object") {
    const allowed = new Set(["healthyDietPercent", "habitualDiet", "foodReactionAllergy", "cravings", "cravingsDegree", "sugarUse", "sugarCoffeeTea", "sugarSweetsDesserts", "regularCarbs", "proteinMain", "proteinFrequency", "redMeat", "fishSeafood", "proteinComments", "fatsMain", "fatsFrequency", "friedFoodGolden", "transFatsLabels", "fatsData", "fatsComments", "fiberVegetables", "fiberFruits", "fiberTracking", "fiberData", "fiberComments", "hydrationWaterAmount", "hydrationOtherDrinks", "hydrationCoffee", "hydrationData", "hydrationComments", "mealMealsPerDay", "mealSnacks", "mealStressEating", "mealBreakfast", "mealBreakfastProducts", "mealLunch", "mealLunchWhereWorkdays", "mealDinner", "mealDinnerTime", "mealDinnerComposition", "mealRegimenData", "mealRegimenComments", "comments"]);
    Object.entries(fallback).forEach(([k, v]) => {
      if (!allowed.has(k)) return;
      if (v == null || v === "") return;
      if (k === "healthyDietPercent") {
        if (out.healthyDietPercent == null && Number.isFinite(+v)) out.healthyDietPercent = +v;
        return;
      }
      if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
    });
  }
  return out;
};

const normalizeQuestionnaire = (questionnaire) => {
  const normalized = {
    wellbeing: {
      energy: {},
      anxiety: {},
      mood: {},
      sleep: {},
      focus: {}
    },
    appearance: {},
    digestion: {},
    maleHealth: {},
    femaleHealth: {},
    immune: {},
    stress: {},
    habits: {},
    history: {},
    cardio: {},
    respiratory: {},
    musculoskeletal: {},
    nutrition: {},
    activity: {}
  };

  const sectionMap = {
    "самочувствие": "wellbeing",
    "внешний вид": "appearance",
    "пищеварение": "digestion",
    "мужское здоровье": "maleHealth",
    "женское здоровье": "femaleHealth",
    "имунная система": "immune",
    "иммунная система": "immune",
    "уровень стресса": "stress",
    "вредные привычки": "habits",
    "анамез": "history",
    "анамнез": "history",
    "прием витаминов и медикаментов": "history",
    "наследственность и генетика": "history",
    "сердечно-сосудистая система": "cardio",
    "дыхательная система": "respiratory",
    "скелетно-мышечная система": "musculoskeletal",
    "питание и пищевые привычки": "nutrition",
    "физическая активность": "activity"
  };

  const wellbeingGroupMap = {
    "энерг": "energy",
    "тревож": "anxiety",
    "настроен": "mood",
    "сон": "sleep",
    "концент": "focus"
  };

  const promptAliases = {
    score: [/^оценка$/, /^уровень$/, /^балл$/],
    peak: [/пик/],
    frequency: [/частот/],
    duration: [/длитель/],
    manifestation: [/проявлен/, /симптом/, /жалоб/, /беспокоит/],
    quality: [/качеств/],
    bedtime: [/отбой/, /засыпа/, /лож/],
    issues: [/проблем/, /сложно/, /трудно/, /нарушен/, /сбой/],
    skin: [/кожа/],
    nails: [/ногт/],
    hair: [/волос/],
    tongue: [/язык/],
    libido: [/либидо/],
    potency: [/потенц/],
    urological: [/уролог/, /моче/, /эрекц/],
    orviFreq: [/частота орви/, /как часто.*орви/],
    orvi: [/орви/],
    herpes: [/герпес/],
    allergies: [/аллерг/],
    level: [/уровень стресса/, /^уровень$/],
    sources: [/источник/, /причин/, /что вызывает/],
    coping: [/как справ/, /справляетесь/, /помогает/],
    alcohol: [/алког/],
    stimulants: [/стимулятор/, /кофе/, /энергетик/, /никотин/],
    chronic: [/хронич/],
    meds: [/лекар/, /медикамент/, /витамин/, /добавк/],
    heredity: [/наслед/, /генет/],
    symptoms: [/вздут/, /изжог/, /запор/, /диаре/, /стул/, /тошнот/, /тяжест/],
    cycle: [/цикл/, /менстру/, /месячн/],
    pms: [/пмс/, /предменстру/]
  };

  const pickField = (prompt) => {
    const p = qNorm(prompt);
    for (const [field, patterns] of Object.entries(promptAliases)) {
      if (patterns.some(rx => rx.test(p))) return field;
    }
    return null;
  };

  const detectWellbeingKey = (ctxNorm, fallback = null) => {
    if (ctxNorm.includes("энерг") || ctxNorm.includes("пик энергии")) return "energy";
    if (ctxNorm.includes("тревож") || ctxNorm.includes("паничес") || ctxNorm.includes("навязчив") || ctxNorm.includes("стрессовых ситуац")) return "anxiety";
    if (ctxNorm.includes("настроен") || ctxNorm.includes("апат") || ctxNorm.includes("раздраж") || ctxNorm.includes("депресс") || ctxNorm.includes("отличн") || ctxNorm.includes("снижен")) return "mood";
    if (ctxNorm.includes("сон") || ctxNorm.includes("спите") || ctxNorm.includes("заснуть") || ctxNorm.includes("пробужд") || ctxNorm.includes("отход ко сну")) return "sleep";
    if (ctxNorm.includes("концент") || ctxNorm.includes("памят") || ctxNorm.includes("сосредоточ") || ctxNorm.includes("туман в голове")) return "focus";
    return fallback;
  };

  const pickWellbeingField = (wKey, promptNorm) => {
    if (/как часто/.test(promptNorm)) return "frequency";
    if (/как давно/.test(promptNorm)) return "duration";
    if (wKey === "energy" && /пик/.test(promptNorm)) return "peak";
    if (wKey === "sleep" && /отход ко сну|лож|засып/.test(promptNorm)) return "bedtime";
    if (wKey === "focus" && /оцените качество|качеств/.test(promptNorm)) return "quality";
    if (wKey === "sleep" && /как спите/.test(promptNorm)) return "quality";
    return "manifestation";
  };

  for (const section of questionnaire.sections || []) {
    const sectionKey = sectionMap[qNorm(section.title)] || null;
    if (!sectionKey) continue;

    if ((section.comments || []).length) normalized[sectionKey].comments = section.comments.join("\n");

    for (const group of section.groups || []) {
      const groupNorm = qNorm(group.title);
      let target = normalized[sectionKey];
      let currentWellbeingKey = null;

      if (sectionKey === "wellbeing") {
        const wk = Object.entries(wellbeingGroupMap).find(([k]) => groupNorm.includes(k));
        if (wk) {
          target = normalized.wellbeing[wk[1]];
          currentWellbeingKey = wk[1];
        } else {
          currentWellbeingKey = detectWellbeingKey(groupNorm, currentWellbeingKey);
          if (currentWellbeingKey) target = normalized.wellbeing[currentWellbeingKey];
        }
      }

      for (const question of group.questions || []) {
        const prompt = question.prompt || group.title || section.title;
        const promptNorm = qNorm(prompt);
        const score = qPickScore(question);
        const percentScore = qPickPercentScore(question);
        const joined = qFmtAnswers(question.answers);
        const isComment = /комментар/i.test(promptNorm);

        if (sectionKey === "wellbeing") {
          const ctxNorm = `${groupNorm} | ${promptNorm} | ${qNorm(joined)}`;
          const wKey = detectWellbeingKey(ctxNorm, currentWellbeingKey);
          if (!wKey) continue;
          currentWellbeingKey = wKey;
          const box = normalized.wellbeing[wKey];
          if (isComment && joined) {
            qAppendComment(box, joined);
            continue;
          }
          if (score != null) {
            qSetMaxNumber(box, "score", score);
            continue;
          }
          const field = pickWellbeingField(wKey, promptNorm);
          if (joined) {
            if (field === "frequency" || field === "duration") {
              qAssignField(box, field, joined);
            } else {
              const parts = qSplitCsv(joined);
              if (!parts.length) qAssignField(box, field, joined);
              else {
                parts.forEach(part => {
                  const partKey = detectWellbeingKey(qNorm(part), wKey) || wKey;
                  qAssignField(normalized.wellbeing[partKey], field, part);
                });
              }
            }
          }
          continue;
        }

        const field = pickField(prompt);

        if (sectionKey === "stress") {
          if (percentScore != null) {
            qSetMaxNumber(target, "level", percentScore);
          } else if (qHasPercent(joined)) {
            const parts = qSplitCsv(joined);
            const levelParts = parts
              .filter(v => qHasPercent(v))
              .map(v => {
                const m = qText(v).replace(",", ".").match(/(\d+(?:\.\d+)?)\s*%/);
                return m ? +m[1] : null;
              })
              .filter(n => Number.isFinite(n));
            const sourceParts = parts.filter(v => !qHasPercent(v));
            if (levelParts.length) qSetMaxNumber(target, "level", Math.max(...levelParts));
            if (sourceParts.length) qAppendUnique(target, "sources", sourceParts.join(", "));
          } else if (field === "coping" && joined) {
            qAppendUnique(target, "coping", joined);
          } else if (joined) {
            qAppendUnique(target, "sources", joined);
          }
          continue;
        }

        if (isComment && joined) {
          qAppendComment(target, joined);
          continue;
        }

        if (field) {
          if (sectionKey === "history" && field === "heredity") qAppendUnique(target, field, score != null ? String(score) : joined);
          else qAssignField(target, field, score != null ? String(score) : joined);
        } else if (joined) {
          if (sectionKey === "digestion") qAppendUnique(target, "symptoms", joined);
          else if (sectionKey === "stress") qAppendUnique(target, "sources", joined);
          else if (sectionKey === "femaleHealth") {
            if (/цикл|менстру|месячн/.test(promptNorm) || /цикл|менстру|месячн/.test(groupNorm)) qAppendUnique(target, "cycle", joined);
            else if (/пмс|предменстру/.test(promptNorm) || /пмс|предменстру/.test(groupNorm)) qAppendUnique(target, "pms", joined);
            else qAppendUnique(target, "manifestation", joined);
          } else if (sectionKey === "maleHealth") {
            if (/либидо/.test(promptNorm)) qAppendUnique(target, "libido", joined);
            else if (/потенц/.test(promptNorm)) qAppendUnique(target, "potency", joined);
            else qAppendUnique(target, "urological", joined);
          } else if (sectionKey === "history") {
            const isGenetics = /наследствен|генет/i.test(section.title || "") || /наследствен|генет/i.test(group.title || "") || /наследствен|генет/i.test(prompt || "");
            if (isGenetics) qAppendUnique(target, "heredity", joined);
            else qAppendUnique(target, "chronic", joined);
          } else if (["cardio","respiratory","musculoskeletal","nutrition","activity","appearance","immune"].includes(sectionKey)) {
            qAppendUnique(target, "manifestation", joined);
          }
        }
      }
    }
  }

  return normalized;
};

const detectQuestionnaireSheet = (wb) => {
  let best = null;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

    let sectionHits = 0;
    let boolHits = 0;
    let goalHits = 0;

    for (let r = 0; r < raw.length; r++) {
      const row = qRow(raw, r);
      const texts = qRowTexts(row);
      if (texts.some(text => QUESTIONNAIRE_SECTION_TITLES.has(text))) sectionHits += 1;
      if (texts.some(text => text.toLowerCase() === "мои цели на программу")) goalHits += 1;
      if (row.some(v => qIsChecked(v) || typeof v === "boolean")) boolHits += 1;
    }

    const score = sectionHits * 10 + boolHits * 2 + goalHits * 8;
    if (!best || score > best.score) best = { name, score };
  }

  return best && best.score >= 12 ? best.name : null;
};

const parseQuestionnaireWorkbook = (wb) => {
  let sheetName = detectQuestionnaireSheet(wb);
  if (!sheetName) throw new Error("Лист анкеты не найден по структуре данных");

  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  const gender = qDetectGender(raw, sheetName);

  const questionnaire = {
    version: 2,
    source: "excel",
    structure: "sections",
    gender,
    sheetName,
    meta: {
      fullName: qFindLabelBelow(raw, /^фио/),
      email: qFindLabelBelow(raw, /^email/),
      phone: qFindLabelBelow(raw, /номер телефона|телефон/),
      city: qFindLabelBelow(raw, /город/),
      height: null,
      weight: null,
      weightGoal: null,
      waist: qPickFirstNumber(qFindLabelBelow(raw, /талии|обхват талии/)) || qFindLabelBelow(raw, /талии|обхват талии/),
      gender,
      goals: []
    },
    goals: qExtractGoals(raw),
    sections: [],
    rawAnswers: []
  };

  for (let i = 0; i < raw.length; i++) {
    const row = qRow(raw, i);
    const hIdx = qFindCellIndex(row, text => text.toLowerCase() === "рост");
    const wIdx = qFindCellIndex(row, text => {
      const t = qNorm(text);
      return /^вес(?:\s|,|$)/.test(t) && !t.includes("желаем") && !t.includes("цель") && !t.includes("целев");
    });
    const wgIdx = qFindCellIndex(row, text => {
      const t = qNorm(text);
      return t.includes("вес") && (t.includes("желаем") || t.includes("целев") || t.includes("цель"));
    });
    if (hIdx !== -1) {
      const sameRowH = qPickFirstNumber(row[hIdx + 1]);
      const next = qRow(raw, i + 1);
      questionnaire.meta.height = sameRowH || qPickFirstNumber(next[hIdx]) || questionnaire.meta.height;
    }
    if (wIdx !== -1) {
      const sameRowW = qPickFirstNumber(row[wIdx + 1]);
      const next = qRow(raw, i + 1);
      questionnaire.meta.weight = sameRowW || qPickFirstNumber(next[wIdx]) || questionnaire.meta.weight;
    }
    if (wgIdx !== -1) {
      const sameRowWG = qPickFirstNumber(row[wgIdx + 1]);
      const next = qRow(raw, i + 1);
      questionnaire.meta.weightGoal = sameRowWG || qPickFirstNumber(next[wgIdx]) || questionnaire.meta.weightGoal;
    }
    if (questionnaire.meta.height && questionnaire.meta.weight && questionnaire.meta.weightGoal) break;
  }

  let currentSection = null;
  const zoneState = {};
  let lastWellbeingGroup = "";

  for (let r = 0; r < raw.length; r++) {
    const row = qRow(raw, r);
    const rowTexts = qRowTexts(row);
    const sectionTitle = rowTexts.find(text => QUESTIONNAIRE_SECTION_TITLES.has(text));

    if (sectionTitle) {
      currentSection = qEnsureSection(questionnaire, sectionTitle);
      Object.keys(zoneState).forEach(k => delete zoneState[k]);
      if (qNorm(sectionTitle).includes("самочувствие")) lastWellbeingGroup = "";
      continue;
    }

    if (!currentSection) continue;

    if (rowTexts.some(text => /^комментарий/i.test(text))) {
      const nextTexts = qRowTexts(qRow(raw, r + 1));
      const body = nextTexts.find(text => !/^комментарий/i.test(text));
      if (body) currentSection.comments.push(body);
      r += 1;
      continue;
    }

    const checkedAnswers = qExtractCheckedAnswers(row, qRow(raw, r - 1), qRow(raw, r + 1));
    const hasCheckedAnswers = checkedAnswers.length > 0;
    const zoneTexts = qBuildZoneTexts(row);
    Object.entries(zoneTexts).forEach(([zoneKey, strings]) => {
      if (!strings.length) return;
      const zone = Number(zoneKey);
      const guessedGroup = qGuessQuestionnaireGroup(currentSection.title, strings);
      const cleanedStrings = strings.filter(v => !QUESTIONNAIRE_SECTION_TITLES.has(v) && !/^начните/i.test(v) && !/^мои цели/i.test(v) && !/^комментарий/i.test(v));
      const numberMark = cleanedStrings.find(v => /^\d+\.$/.test(v));

      zoneState[zone] = zoneState[zone] || { group: null, prompt: null };

      if (guessedGroup && (!zoneState[zone].group || !hasCheckedAnswers)) {
        zoneState[zone].group = guessedGroup;
        if (qNorm(currentSection.title).includes("самочувствие")) lastWellbeingGroup = guessedGroup;
      }

      if (numberMark) {
        const prompt = cleanedStrings.find(v => !/^\d+\.$/.test(v));
        if (prompt) zoneState[zone].prompt = prompt;
        return;
      }

      if (cleanedStrings.length === 1) {
        const txt = cleanedStrings[0];
        if (!hasCheckedAnswers) {
          if (!guessedGroup && !zoneState[zone].group) zoneState[zone].group = txt;
          else if (!zoneState[zone].prompt && guessedGroup && qNorm(txt) !== qNorm(guessedGroup)) zoneState[zone].prompt = txt;
        }
        return;
      }

      if (cleanedStrings.length > 1) {
        if (hasCheckedAnswers) return;
        const promptCandidate = cleanedStrings.find(v => !guessedGroup || qNorm(v) !== qNorm(guessedGroup));
        if (promptCandidate && !zoneState[zone].prompt) zoneState[zone].prompt = promptCandidate;
      }
    });

    checkedAnswers.forEach(({ zone, answer }) => {
      const state = zoneState[zone] || {};
      const contextStrings = [
        ...rowTexts,
        ...qRowTexts(qRow(raw, r - 1)),
        ...qRowTexts(qRow(raw, r + 1)),
        state.group,
        state.prompt,
        answer
      ].filter(Boolean);
      let guessedGroup = qGuessQuestionnaireGroup(currentSection.title, contextStrings);
      if (!guessedGroup && qNorm(currentSection.title).includes("самочувствие") && /^\d{1,3}\s*%?$/.test(qText(answer)) && lastWellbeingGroup) {
        guessedGroup = lastWellbeingGroup;
      }
      const stateGroup = state.group && !QUESTIONNAIRE_SECTION_TITLES.has(state.group) && !qLooksLikePromptText(state.group) ? state.group : null;
      const groupTitle = guessedGroup || stateGroup || currentSection.title;
      let prompt = state.prompt && qNorm(state.prompt) !== qNorm(answer) ? state.prompt : (qLooksLikePromptText(answer) ? answer : groupTitle);
      if (qLooksLikeScaleValue(answer)) {
        const secNorm = qNorm(currentSection.title);
        if (secNorm.includes("уровень стресса")) prompt = "Уровень стресса";
        else if (secNorm.includes("самочувствие")) prompt = "Оценка";
      }
      if (qNorm(currentSection.title).includes("самочувствие") && guessedGroup) lastWellbeingGroup = guessedGroup;
      const group = qEnsureGroup(currentSection, groupTitle);
      const question = qEnsureQuestion(group, prompt);
      if (!question.answers.includes(answer)) question.answers.push(answer);
      questionnaire.rawAnswers.push({
        section: currentSection.title,
        group: groupTitle,
        prompt,
        answer
      });
    });
  }

  if (questionnaire.meta.height != null && questionnaire.meta.height !== "") questionnaire.meta.height = qPickFirstNumber(questionnaire.meta.height) || questionnaire.meta.height;
  if (questionnaire.meta.weight != null && questionnaire.meta.weight !== "") questionnaire.meta.weight = qPickFirstNumber(questionnaire.meta.weight) || questionnaire.meta.weight;
  if (questionnaire.meta.weightGoal != null && questionnaire.meta.weightGoal !== "") questionnaire.meta.weightGoal = qPickFirstNumber(questionnaire.meta.weightGoal) || questionnaire.meta.weightGoal;
  if (questionnaire.meta.waist != null && questionnaire.meta.waist !== "") questionnaire.meta.waist = qPickFirstNumber(questionnaire.meta.waist) || questionnaire.meta.waist;
  questionnaire.meta.goals = [...questionnaire.goals];
  questionnaire.normalized = normalizeQuestionnaire(questionnaire);
  questionnaire.normalized.wellbeing = qExtractWellbeingNormalizedFromRaw(raw);
  questionnaire.normalized.appearance = qExtractAppearanceNormalizedFromRaw(raw);
  questionnaire.normalized.digestion = qExtractDigestionNormalizedFromRaw(raw);
  questionnaire.normalized.femaleHealth = qExtractFemaleHealthNormalizedFromRaw(raw, questionnaire.normalized.femaleHealth);
  questionnaire.normalized.maleHealth = qExtractMaleHealthNormalizedFromRaw(raw);
  questionnaire.normalized.respiratory = qExtractRespiratoryNormalizedFromRaw(raw);
  questionnaire.normalized.cardio = qExtractCardioNormalizedFromRaw(raw);
  questionnaire.normalized.musculoskeletal = qExtractMusculoskeletalNormalizedFromRaw(raw);
  questionnaire.normalized.immune = qExtractImmuneNormalizedFromRaw(raw);
  questionnaire.normalized.stress = qExtractStressNormalizedFromRaw(raw, questionnaire.normalized.stress);
  questionnaire.normalized.habits = qExtractHabitsNormalizedFromRaw(raw, questionnaire.normalized.habits);
  questionnaire.normalized.history = qExtractAnamnesNormalizedFromRaw(raw, questionnaire.normalized.history);
  questionnaire.normalized.activity = qExtractActivityNormalizedFromRaw(raw, questionnaire.normalized.activity);
  questionnaire.normalized.nutrition = qExtractNutritionNormalizedFromRaw(raw);
  return questionnaire;
};

module.exports = { parseQuestionnaireWorkbook };
