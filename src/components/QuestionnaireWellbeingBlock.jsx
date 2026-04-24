import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import Ed from "./Ed";
import QWellbeingCard from "./QWellbeingCard";
import ScoreBar from "./ScoreBar";
import Wrapper from "./Wrapper";

const WELLBEING_SPEC = [
  { key: "energy", title: "1. Уровень энергии", icon: "⚡", items: [["peak", "1.1. Пик энергии у вас"], ["frequency", "1.2. Как часто"], ["duration", "1.3. Как давно длится"]] },
  { key: "anxiety", title: "2. Тревожность", icon: "😰", items: [["manifestation", "2.1. Проявление"], ["frequency", "2.2. Как часто"], ["duration", "2.3. Как давно длится"]] },
  { key: "mood", title: "3. Настроение", icon: "🙂", items: [["manifestation", "3.1. Какое у вас настроение"], ["frequency", "3.2. Как часто"], ["duration", "3.3. Как давно длится"]] },
  { key: "sleep", title: "4. Качество сна", icon: "😴", items: [["quality", "4.1. Как спите"], ["frequency", "4.2. Как часто"], ["duration", "4.3. Как давно длится"], ["bedtime", "4.4. Отход ко сну"]] },
  { key: "focus", title: "5. Концентрация и память", icon: "🎯", items: [["quality", "5.1. Оцените качество"], ["frequency", "5.2. Как часто"], ["duration", "5.3. Как давно длится"]] },
];

const WELLBEING_SUMMARY = [
  ["energy", "Энергия"],
  ["anxiety", "Тревожность"],
  ["mood", "Настроение"],
  ["sleep", "Сон"],
  ["focus", "Концентрация"],
];

export default function QuestionnaireWellbeingBlock({
  questionnaire,
  questionnaireView,
  questionnairePathPrefix,
  uS,
  readOnly = false,
}) {
  const { $ } = useTheme();
  const wellbeing = questionnaireView.wellbeing;
  if (!wellbeing) return null;

  return (
    <Card tone="accent">
      <Wrapper gap="md">
        <div style={{ fontSize: 13, fontWeight: 700, color: $.ac }}>🧠 Самочувствие</div>

        <Wrapper columns="repeat(auto-fit, minmax(170px, 1fr))" gap="md">
          {WELLBEING_SUMMARY.map(([key, label]) => {
            const rawValue = wellbeing?.[key]?.score;
            const score = rawValue == null || rawValue === "" || Number.isNaN(+rawValue) ? null : +rawValue;
            return (
              <Wrapper key={key} gap="xs">
                <div style={{ fontSize: 12, color: $.txS }}>{label}</div>
                {score != null ? (
                  <ScoreBar s={score} invert={key === "anxiety"} />
                ) : (
                  <div style={{ fontSize: 12, color: $.txM, padding: "6px 0" }}>Нет оценки</div>
                )}
              </Wrapper>
            );
          })}
        </Wrapper>

        <Wrapper columns="repeat(auto-fit, minmax(320px, 1fr))" gap="sm">
          {WELLBEING_SPEC.map((spec) => (
            <QWellbeingCard
              key={spec.key}
              spec={spec}
              data={wellbeing?.[spec.key]}
              path={`${questionnairePathPrefix}wellbeing.${spec.key}`}
              uS={uS}
              readOnly={readOnly}
            />
          ))}
        </Wrapper>

        {wellbeing.comments && (
          <Wrapper gap="sm">
            <div style={{ paddingTop: 10, borderTop: `1px solid ${$.brd}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>
                📝 Комментарий к блоку самочувствие
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: $.bgI,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <Ed
                  value={String(wellbeing.comments)}
                  editKey={`q-${questionnairePathPrefix}wellbeing-comments`}
                  multiline
                  onSave={(nextValue) =>
                    uS((stage) => {
                      const target = questionnaire.normalized ? stage.questionnaire.normalized.wellbeing : stage.questionnaire.wellbeing;
                      target.comments = nextValue;
                    })
                  }
                  readOnly={readOnly}
                />
              </div>
            </div>
          </Wrapper>
        )}
      </Wrapper>
    </Card>
  );
}
