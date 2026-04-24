import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import { makeFieldSaver } from "../utils/questionnaireUtils";

export default function QMaleHealthCard({ data, path, uS, readOnly = false }) {
  if (!data || typeof data !== "object") return null;
  const { $ } = useTheme();
  const save = makeFieldSaver(uS, path);
  const qa = (k, label) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} readOnly={readOnly} />
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>♂️ Мужское здоровье</div>
        {qa("libido", "1. Либидо")}
        {qa("potency", "2. Потенция")}
        {qa("painUrination", "3. Боль при мочеиспускании")}
        {qa("weakStream", "4. Вялая струя")}
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
      </Card>
    </div>
  );
}
