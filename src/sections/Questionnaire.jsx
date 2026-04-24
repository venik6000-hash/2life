import Button from "../components/Button";
import FileUploadButton from "../components/FileUploadButton";
import QActivityCard from "../components/QActivityCard";
import QAnamnesCard from "../components/QAnamnesCard";
import QAppearanceCard from "../components/QAppearanceCard";
import QCardioCard from "../components/QCardioCard";
import QDataBlock from "../components/QDataBlock";
import QDigestionCard from "../components/QDigestionCard";
import QHabitsCard from "../components/QHabitsCard";
import QImmuneCard from "../components/QImmuneCard";
import QMaleHealthCard from "../components/QMaleHealthCard";
import QMusculoskeletalCard from "../components/QMusculoskeletalCard";
import QNutritionCard from "../components/QNutritionCard";
import QRespiratoryCard from "../components/QRespiratoryCard";
import QSectionCard from "../components/QSectionCard";
import QStressCard from "../components/QStressCard";
import QuestionnaireStatusCard from "../components/QuestionnaireStatusCard";
import QuestionnaireWellbeingBlock from "../components/QuestionnaireWellbeingBlock";
import Wrapper from "../components/Wrapper";

const SECTION_ORDER = [
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
  "Оценка готовности",
];

const normalizeText = (value) => String(value || "").toLowerCase().replace(/ё/g, "е").trim();

const hasText = (value) => String(value ?? "").trim() !== "";

const hasObjectData = (value) => {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, entry]) => {
    if (key === "comments") return hasText(entry);
    if (Array.isArray(entry)) return entry.some((item) => hasText(item));
    if (entry && typeof entry === "object") return hasObjectData(entry);
    return hasText(entry);
  });
};

const hasQuestionnaireData = (value) => {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((entry) => {
    if (Array.isArray(entry)) return entry.length > 0;
    if (entry && typeof entry === "object") return hasObjectData(entry);
    return hasText(entry);
  });
};

const sortSections = (sections = []) => [...sections].sort((left, right) => {
  const leftIndex = SECTION_ORDER.indexOf(left.title);
  const rightIndex = SECTION_ORDER.indexOf(right.title);
  if (leftIndex === -1 && rightIndex === -1) return left.title.localeCompare(right.title);
  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  return leftIndex - rightIndex;
});

const resolveHealthMode = (questionnaire, normalizedQuestionnaire) => {
  const sectionTitles = (questionnaire.sections || []).map((section) => normalizeText(section.title));
  const hasMaleSection = sectionTitles.includes("мужское здоровье");
  const hasFemaleSection = sectionTitles.includes("женское здоровье");
  const hasMaleData = hasObjectData(normalizedQuestionnaire.maleHealth);
  const hasFemaleData = hasObjectData(normalizedQuestionnaire.femaleHealth);

  if (hasMaleSection && !hasFemaleSection) return "male";
  if (hasFemaleSection && !hasMaleSection) return "female";
  if (questionnaire.gender === "male") return "male";
  if (questionnaire.gender === "female") return "female";
  if (hasMaleData && !hasFemaleData) return "male";
  if (hasFemaleData && !hasMaleData) return "female";
  if (hasMaleData) return "male";
  if (hasFemaleData) return "female";
  return null;
};

export default function QuestionnaireSection({
  st,
  uS,
  importStageExcel,
  canImportData,
  readOnly = false,
}) {
  const questionnaire = st.questionnaire;

  const uploadQuestionnaire = async (file) => {
    try {
      await importStageExcel(file, "questionnaire");
    } catch (error) {
      alert(`Ошибка загрузки: ${error.message}`);
    }
  };

  const clearQuestionnaire = () => {
    if (!window.confirm("Очистить анкету текущего этапа?")) return;
    uS((stage) => {
      stage.questionnaire = {};
    });
  };

  const renderActions = (showClear = true) => (
    <Wrapper dir="row" gap="sm" align="center" wrap>
      {canImportData && !readOnly && (
        <FileUploadButton accept=".xlsx,.xls" onSelect={uploadQuestionnaire}>
          📥 Загрузить анкету
        </FileUploadButton>
      )}
      {showClear && !readOnly && (
        <Button variant="ghost" tone="danger" size="sm" onClick={clearQuestionnaire}>
          Очистить анкету
        </Button>
      )}
    </Wrapper>
  );

  if (!questionnaire) {
    return (
      <QuestionnaireStatusCard empty actions={renderActions(false)} />
    );
  }

  const questionnaireView = questionnaire.normalized || questionnaire;
  const questionnairePathPrefix = questionnaire.normalized ? "normalized." : "";
  const hasMedicalData = hasQuestionnaireData(questionnaireView);

  if (questionnaire.structure === "sections" && !questionnaire.normalized) {
    const sortedSections = sortSections(questionnaire.sections || []);

    return (
      <Wrapper gap="lg">
        <QuestionnaireStatusCard
          actions={renderActions()}
          warning={!sortedSections.length ? "После импорта анкеты медицинские ответы сюда не попали. Проверьте парсер или загрузите более полный файл." : ""}
        />

        <Wrapper columns="repeat(auto-fit, minmax(320px, 1fr))" gap="md">
          {sortedSections.map((section, index) => (
            <QSectionCard key={`${section.title}-${index}`} section={section} />
          ))}
        </Wrapper>
      </Wrapper>
    );
  }

  const healthMode = resolveHealthMode(questionnaire, questionnaireView);

  return (
    <Wrapper gap="lg">
      <QuestionnaireStatusCard
        actions={renderActions()}
        warning={!hasMedicalData ? "После импорта анкеты медицинские ответы сюда не попали. Проверьте парсер или загрузите более полный файл." : ""}
      />

      {questionnaireView.wellbeing && (
        <QuestionnaireWellbeingBlock
          questionnaire={questionnaire}
          questionnaireView={questionnaireView}
          questionnairePathPrefix={questionnairePathPrefix}
          uS={uS}
          readOnly={readOnly}
        />
      )}

      {questionnaireView.nutrition && (
        <QNutritionCard
          data={questionnaireView.nutrition}
          path={`${questionnairePathPrefix}nutrition`}
          uS={uS}
          readOnly={readOnly}
        />
      )}

      <Wrapper columns="repeat(auto-fit, minmax(320px, 1fr))" gap="sm">
        {questionnaireView.appearance && (
          <QAppearanceCard
            data={questionnaireView.appearance}
            path={`${questionnairePathPrefix}appearance`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {questionnaireView.digestion && (
          <QDigestionCard
            data={questionnaireView.digestion}
            path={`${questionnairePathPrefix}digestion`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {healthMode === "male" && (
          <QMaleHealthCard
            data={questionnaireView.maleHealth || {}}
            path={`${questionnairePathPrefix}maleHealth`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {healthMode === "female" && questionnaireView.femaleHealth && (
          <QDataBlock
            title="♀️ Жен. здоровье"
            data={questionnaireView.femaleHealth}
            path={`${questionnairePathPrefix}femaleHealth`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {questionnaireView.immune && (
          <QImmuneCard
            data={questionnaireView.immune}
            path={`${questionnairePathPrefix}immune`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {questionnaireView.stress && (
          <QStressCard
            data={questionnaireView.stress}
            path={`${questionnairePathPrefix}stress`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {questionnaireView.habits && (
          <QHabitsCard
            data={questionnaireView.habits}
            path={`${questionnairePathPrefix}habits`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {questionnaireView.history && (
          <QAnamnesCard
            data={questionnaireView.history}
            path={`${questionnairePathPrefix}history`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {questionnaireView.cardio && (
          <QCardioCard
            data={questionnaireView.cardio}
            path={`${questionnairePathPrefix}cardio`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {questionnaireView.respiratory && (
          <QRespiratoryCard
            data={questionnaireView.respiratory}
            path={`${questionnairePathPrefix}respiratory`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {questionnaireView.musculoskeletal && (
          <QMusculoskeletalCard
            data={questionnaireView.musculoskeletal}
            path={`${questionnairePathPrefix}musculoskeletal`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
        {questionnaireView.activity && (
          <QActivityCard
            data={questionnaireView.activity}
            path={`${questionnairePathPrefix}activity`}
            uS={uS}
            readOnly={readOnly}
          />
        )}
      </Wrapper>
    </Wrapper>
  );
}
