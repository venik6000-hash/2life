import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import PercentBar from "./PercentBar";

export default function QNutritionCard({ data, path, uS, readOnly = false }) {
  if (!data || typeof data !== "object") return null;
  const { $ } = useTheme();

  const save = (key, value) => uS(s => {
    const pts = path.split(".");
    let o = s.questionnaire;
    for (const p of pts) { if (o && o[p] !== undefined) o = o[p]; }
    if (key === "healthyDietPercent") {
      const n = +String(value).replace(",", ".").replace("%", "").trim();
      o[key] = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : value;
    } else {
      o[key] = value;
    }
  });

  const qa = (k, label, sub = false) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} sub={sub} labelWidth="180px" readOnly={readOnly} />
  );

  const pRaw = data.healthyDietPercent;
  const pct = Number.isFinite(+pRaw) ? Math.max(0, Math.min(100, +pRaw)) : null;

  const SubCard = ({ title, children }) => (
    <div style={{ marginBottom: 0 }}>
      <Card size="sm">
        <div style={{ fontSize: 12, fontWeight: 700, color: $.ac, marginBottom: 6 }}>{title}</div>
        {children}
      </Card>
    </div>
  );

  const subQa = (k, label) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} labelWidth="160px" readOnly={readOnly} />
  );

  const subComment = (field) => (
    <QCommentBlock value={data[field]} fieldKey={`q-${path}-${field}`} onSave={v => save(field, v)} readOnly={readOnly} />
  );

  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>🍽️ Питание и пищевые привычки</div>
        <div style={{ padding: "6px 0", borderBottom: `1px solid ${$.brd}`, display: "grid", gridTemplateColumns: "minmax(180px,42%) minmax(0,1fr)", columnGap: 14, alignItems: "start" }}>
          <span style={{ color: $.txS, fontSize: 12 }}>1. На сколько вы придерживаетесь здорового рациона</span>
          <PercentBar value={pct} />
        </div>
        <div style={{ marginTop: 10 }}>
          {qa("habitualDiet", "2. Ваш привычный рацион")}
          {qa("foodReactionAllergy", "3. Реакция на еду, аллергия")}
          <div style={{ paddingTop: 2 }}>
            {qa("cravings", "4. Есть ли тяга к определенным продуктам?")}
            {qa("cravingsDegree", "4.1. Степень тяги", true)}
          </div>
          <div style={{ paddingTop: 2 }}>
            {qa("sugarUse", "5. Употребление сахара")}
            {qa("sugarCoffeeTea", "5.1. В кофе, чае", true)}
            {qa("sugarSweetsDesserts", "5.2. Сладости, десерты", true)}
          </div>
          {qa("regularCarbs", "6. Углеводы в рационе на регулярной основе")}
        </div>
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <SubCard title="Белок">
            {subQa("proteinMain", "1. Основной белок в рационе")}
            {subQa("proteinFrequency", "2. Как часто едите белок")}
            {subQa("redMeat", "3. Красное мясо в рационе")}
            {subQa("fishSeafood", "4. Рыба и морепродукты в рационе")}
            {subComment("proteinComments")}
          </SubCard>
          <SubCard title="Жиры">
            {subQa("fatsMain", "1. Основные жиры в рационе")}
            {subQa("fatsFrequency", "2. Как часто едите жиры?")}
            {subQa("friedFoodGolden", "3. Жаренная пища до золотистой корочки")}
            {subQa("transFatsLabels", "4. Читаете на этикетках трансжиры")}
            {subComment("fatsComments")}
          </SubCard>
          <SubCard title="Овощи, фрукты, клетчатка">
            {subQa("fiberVegetables", "1. Овощи в рационе")}
            {subQa("fiberFruits", "2. Фрукты в рационе")}
            {subQa("fiberTracking", "3. Следите за количеством потребляемой клетчатки")}
            {subComment("fiberComments")}
          </SubCard>
          <SubCard title="Питьевой режим">
            {subQa("hydrationWaterAmount", "1. Сколько чистой воды пьёте")}
            {subQa("hydrationOtherDrinks", "2. Какие напитки ещё употребляете")}
            {subQa("hydrationCoffee", "3. Кофе")}
            {subComment("hydrationComments")}
          </SubCard>
          <SubCard title="Режим питания">
            {subQa("mealMealsPerDay", "1. Сколько приёмов пищи в день")}
            {subQa("mealSnacks", "2. Перекусы")}
            {subQa("mealStressEating", "3. Заедаете ли вы стресс и усталость")}
            {subQa("mealBreakfast", "4. Завтрак")}
            {subQa("mealBreakfastProducts", "5. Привычные продукты на завтрак")}
            {subQa("mealLunch", "6. Обед")}
            {subQa("mealLunchWhereWorkdays", "7. Где обедаете в рабочие дни")}
            {subQa("mealDinner", "8. Ужин")}
            {subQa("mealDinnerTime", "9. Время ужина")}
            {subQa("mealDinnerComposition", "10. Ужин как правило состоит из")}
            {subComment("mealRegimenComments")}
          </SubCard>
        </div>
      </Card>
    </div>
  );
}
