import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import { makeFieldSaver } from "../utils/questionnaireUtils";

export default function QDigestionCard({ data, path, uS, readOnly = false }) {
  const { $ } = useTheme();
  if (!data || typeof data !== "object") return null;
  const save = makeFieldSaver(uS, path);
  const qa = (k, label, sub = false) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} sub={sub} readOnly={readOnly} />
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>🫃 Пищеварение</div>
        <div style={{ paddingTop: 2 }}>
          {qa("afterMealSensation", "1. Ощущение после еды")}
          {qa("afterMealDuration", "1.1. Как давно длится", true)}
        </div>
        {qa("tongueState", "2. Состояние языка")}
        {qa("breathOdor", "3. Запах из рта")}
        <div style={{ paddingTop: 2 }}>
          {qa("stool", "4. Стул")}
          {qa("stoolFrequency", "4.1. Частота", true)}
        </div>
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
      </Card>
    </div>
  );
}
