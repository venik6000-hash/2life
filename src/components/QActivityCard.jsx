import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import { makeFieldSaver } from "../utils/questionnaireUtils";

export default function QActivityCard({ data, path, uS, readOnly = false }) {
  const { $ } = useTheme();
  if (!data || typeof data !== "object") return null;
  const save = makeFieldSaver(uS, path);
  const qa = (k, label) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} readOnly={readOnly} />
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>🏃 Физическая активность</div>
        {qa("activityType", "1. Вид физической активности")}
        {qa("regularity", "2. Регулярность")}
        {qa("sessionDuration", "3. Длительность занятий")}
        {qa("fitnessTolerance", "4. Переносимость фитнеса")}
        {qa("dailyActivity", "5. Ежедневная активность")}
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
      </Card>
    </div>
  );
}
