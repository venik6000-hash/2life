import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import { makeFieldSaver } from "../utils/questionnaireUtils";

export default function QRespiratoryCard({ data, path, uS, readOnly = false }) {
  if (!data || typeof data !== "object") return null;
  const { $ } = useTheme();
  const save = makeFieldSaver(uS, path);
  const qa = (k, label, sub = false) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} sub={sub} readOnly={readOnly} />
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>🫁 Дыхательная система</div>
        <div style={{ paddingTop: 2 }}>
          {qa("breathingIssue", "1. Нарушение дыхания")}
          {qa("breathingIssueFrequency", "1.1. Как часто", true)}
        </div>
        {qa("cough", "2. Кашель")}
        {qa("smoking", "3. Вы курите?")}
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
      </Card>
    </div>
  );
}
