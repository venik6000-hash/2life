import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import { makeFieldSaver } from "../utils/questionnaireUtils";

export default function QHabitsCard({ data, path, uS, readOnly = false }) {
  const { $ } = useTheme();
  if (!data || typeof data !== "object") return null;
  const save = makeFieldSaver(uS, path);
  const qa = (k, label) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} labelWidth="170px" readOnly={readOnly} />
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>🚫 Вредные привычки</div>
        {qa("alcohol", "1. Алкоголь")}
        {qa("alcoholDrinks", "2. Какие напитки употребляете")}
        {qa("stimulants", "3. Стимуляторы")}
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
      </Card>
    </div>
  );
}
