import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import QaRow from "./QaRow";
import ScoreBar from "./ScoreBar";
import { makeFieldSaver, parseScore } from "../utils/questionnaireUtils";

export default function QWellbeingCard({ spec, data, path, uS, readOnly = false }) {
  const { $ } = useTheme();
  const save = makeFieldSaver(uS, path);
  const score = parseScore(data?.score);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: $.ac }}>{spec.icon} {spec.title}</div>
        <div style={{ minWidth: 130 }}>
          {score != null
            ? <ScoreBar s={score} invert={spec.key === "anxiety"} />
            : <div style={{ fontSize: 11, color: $.txM, textAlign: "right" }}>Нет оценки</div>}
        </div>
      </div>
      {spec.items.map(([field, label]) => (
        <QaRow
          key={field}
          label={label}
          fieldKey={`q-${path}-${field}`}
          value={data?.[field]}
          onSave={v => save(field, v)}
          readOnly={readOnly}
        />
      ))}
    </Card>
  );
}
