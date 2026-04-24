import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import ScoreBar from "./ScoreBar";
import Ed from "./Ed";
import QCommentBlock from "./QCommentBlock";
import { QT } from "../data/questionnaireTranslations";
import { makeFieldSaver } from "../utils/questionnaireUtils";

// Generic questionnaire data block. Renders all non-"comments" object entries
// using the QT translation map. Matches the old "Bl" component.
export default function QDataBlock({ title, data, path, uS, readOnly = false }) {
  const { $ } = useTheme();
  if (!data || typeof data !== "object") return null;
  const save = makeFieldSaver(uS, path);
  const entries = Object.entries(data).filter(([k, v]) => k !== "comments" && v != null && v !== "");

  return (
    <div style={{ marginBottom: 10 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: $.ac }}>{title}</div>
        {entries.map(([k, v]) => (
          <div key={k} style={{ padding: "5px 0", borderBottom: `1px solid ${$.brd}`, fontSize: 12, lineHeight: 1.45, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ color: $.txS, fontSize: 12, flex: "0 0 145px", maxWidth: "45%" }}>{QT[k] || k}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {k === "score"
                ? <ScoreBar s={v} />
                : typeof v === "object" && !Array.isArray(v)
                  ? <span style={{ color: $.txM }}>[...]</span>
                  : (
                    <Ed
                      value={String(v)}
                      editKey={`q-${path}-${k}`}
                      onSave={(nextValue) => save(k, nextValue)}
                      size="sm"
                      readOnly={readOnly}
                    />
                  )}
            </span>
          </div>
        ))}
        {data.comments != null && (
          <QCommentBlock
            value={data.comments}
            fieldKey={`q-${path}-comments`}
            onSave={v => save("comments", v)}
            readOnly={readOnly}
          />
        )}
      </Card>
    </div>
  );
}
