import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import { makeFieldSaver } from "../utils/questionnaireUtils";

export default function QMusculoskeletalCard({ data, path, uS, readOnly = false }) {
  const { $ } = useTheme();
  if (!data || typeof data !== "object") return null;
  const save = makeFieldSaver(uS, path);
  const qa = (k, label, sub = false) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} sub={sub} readOnly={readOnly} />
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>🦴 Скелетно-мышечная система</div>
        <div style={{ paddingTop: 2 }}>
          {qa("neckBackLowerBackDiscomfort", "1. Дискомфорт в шее, спине, пояснице")}
          {qa("neckBackLowerBackFrequency", "1.1. Как часто", true)}
        </div>
        {qa("muscleDiscomfort", "2. Дискомфорт в мышцах")}
        <div style={{ paddingTop: 2 }}>
          {qa("jointDiscomfort", "3. Дискомфорт в суставах")}
          {qa("jointManifestation", "3.1. Как проявляется", true)}
          {qa("jointFrequency", "3.2. Как часто", true)}
        </div>
        {qa("legEdema", "4. Отеки ног")}
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
      </Card>
    </div>
  );
}
