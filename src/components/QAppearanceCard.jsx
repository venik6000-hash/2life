import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import { makeFieldSaver } from "../utils/questionnaireUtils";

export default function QAppearanceCard({ data, path, uS, readOnly = false }) {
  if (!data || typeof data !== "object") return null;
  const { $ } = useTheme();
  const save = makeFieldSaver(uS, path);
  const qa = (k, label, sub = false) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} sub={sub} readOnly={readOnly} />
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>👤 Внешний вид</div>
        {qa("skinState", "1. Состояние кожи")}
        <div style={{ paddingTop: 2 }}>
          {qa("skinRash", "2. Высыпания на коже")}
          {qa("skinRashFrequency", "Как часто?", true)}
        </div>
        <div style={{ paddingTop: 2 }}>
          {qa("edema", "3. Отёки")}
          {qa("edemaFrequency", "Как часто?", true)}
        </div>
        {qa("hair", "4. Волосы")}
        {qa("nails", "5. Ногти")}
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
      </Card>
    </div>
  );
}
