import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import { makeFieldSaver } from "../utils/questionnaireUtils";

export default function QCardioCard({ data, path, uS, readOnly = false }) {
  const { $ } = useTheme();
  if (!data || typeof data !== "object") return null;
  const save = makeFieldSaver(uS, path);
  const qa = (k, label, sub = false) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} sub={sub} readOnly={readOnly} />
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>❤️ Сердечно-сосудистая система</div>
        {qa("bloodPressure", "1. Артериальное давление")}
        {qa("arrhythmia", "2. Нарушение ритма")}
        <div style={{ paddingTop: 2 }}>
          {qa("heartPain", "3. Боли в сердце")}
          {qa("heartPainTriggers", "3.1. После чего усиливается", true)}
          {qa("heartPainFrequency", "3.2. Как часто", true)}
        </div>
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
      </Card>
    </div>
  );
}
