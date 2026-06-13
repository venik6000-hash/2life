import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import { makeFieldSaver } from "../utils/questionnaireUtils";

export default function QImmuneCard({ data, path, uS, readOnly = false }) {
  const { $ } = useTheme();
  if (!data || typeof data !== "object") return null;
  const save = makeFieldSaver(uS, path);
  const qa = (k, label, sub = false) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} sub={sub} readOnly={readOnly} />
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>🛡️ Имунная система</div>
        {qa("coldViral", "1. Простудные и вирусные заболевания")}
        <div style={{ paddingTop: 2 }}>
          {qa("covid19", "2. COVID-19")}
          {qa("postCovidChanges", "2.1. Какие изменения в самочувствии после", true)}
        </div>
        {qa("herpes", "3. Герпес")}
        <div style={{ paddingTop: 2 }}>
          {qa("allergy", "4. Аллергия")}
          {qa("allergyDuration", "4.1. Как давно длится", true)}
        </div>
        {qa("autoimmune", "5. Аутоимунные заболевания")}
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
      </Card>
    </div>
  );
}
