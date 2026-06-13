import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import QCommentBlock from "./QCommentBlock";
import PercentBar from "./PercentBar";

export default function QStressCard({ data, path, uS, readOnly = false }) {
  const { $ } = useTheme();
  if (!data || typeof data !== "object") return null;

  const save = (key, value) => uS(s => {
    const pts = path.split(".");
    let o = s.questionnaire;
    for (const p of pts) { if (o && o[p] !== undefined) o = o[p]; }
    if (key === "level") {
      const n = +String(value).replace(",", ".").replace("%", "").trim();
      o[key] = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : value;
    } else {
      o[key] = value;
    }
  });

  const lvlRaw = data.level;
  const lvl = Number.isFinite(+lvlRaw) ? Math.max(0, Math.min(100, +lvlRaw)) : null;

  const qa = (k, label, sub = false) => (
    <QaRow key={k} label={label} fieldKey={`q-${path}-${k}`} value={data[k]} onSave={v => save(k, v)} sub={sub} labelWidth="165px" readOnly={readOnly} />
  );

  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>🧘 Уровень стресса</div>
        <div style={{ padding: "6px 0", borderBottom: `1px solid ${$.brd}`, display: "grid", gridTemplateColumns: "minmax(180px,42%) minmax(0,1fr)", columnGap: 14, alignItems: "start" }}>
          <span style={{ color: $.txS, fontSize: 12 }}>1. Оцените уровень стресса</span>
          <PercentBar value={lvl} inverted />
        </div>
        {qa("sources", "2. Источники стресса")}
        {qa("duration", "3. Длительность стресса")}
        {qa("coping", "4. Работа со стрессом")}
        <QCommentBlock value={data.comments} fieldKey={`q-${path}-comments`} onSave={v => save("comments", v)} readOnly={readOnly} />
      </Card>
    </div>
  );
}
