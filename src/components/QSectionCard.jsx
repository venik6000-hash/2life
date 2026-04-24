import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import ScoreBar from "./ScoreBar";
import Badge from "./Badge";

const getScore = (answers = []) => {
  for (const ans of answers) {
    const s = String(ans).trim().replace(",", ".");
    if (/^\d+(?:\.\d+)?$/.test(s)) {
      const n = +s;
      if (n >= 1 && n <= 10) return n;
    }
  }
  return null;
};

const fmtAns = (answers = []) => answers.filter(Boolean).join(", ");

function QAItem({ qq, gr, $, brd }) {
  const answers = (qq.answers || []).filter(Boolean);
  const score = getScore(answers);
  const label = qq.prompt === gr.title ? gr.title : qq.prompt;

  if (score != null) {
    return (
      <div style={{ padding: "8px 0", borderBottom: `1px solid ${brd}` }}>
        <div style={{ fontSize: 12, color: $.txS, marginBottom: 6 }}>{label}</div>
        <ScoreBar s={score} />
      </div>
    );
  }

  const oneLine = answers.length <= 1;
  return (
    <div style={{ padding: "7px 0", borderBottom: `1px solid ${brd}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: oneLine ? "center" : "flex-start", gap: 12 }}>
        <div style={{ minWidth: 140, color: $.txS, fontSize: 12 }}>{label}</div>
        <div style={{ flex: 1, textAlign: "right" }}>
          {oneLine
            ? <span style={{ fontSize: 13, fontWeight: 500, borderBottom: `1px dashed ${brd}`, paddingBottom: 1 }}>{fmtAns(answers) || "—"}</span>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                {answers.map((ans, ai) => <Badge key={ai} c="in" ch={ans} />)}
              </div>}
        </div>
      </div>
    </div>
  );
}

// Renders one section card from the sections-format questionnaire (read-only).
export default function QSectionCard({ section }) {
  const { $ } = useTheme();
  const isCommentLike = (txt = "") => /комментар/i.test(String(txt || ""));

  const groups = (section.groups || []).map(gr => ({
    ...gr,
    sectionTitle: section.title,
    questions: (gr.questions || []).filter(q2 => !isCommentLike(q2.prompt)),
  }));

  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: $.ac }}>{section.title}</div>
      {groups.map((gr, gi) => {
        const hasRows = (gr.questions || []).length > 0;
        if (!hasRows && !(gr.title && gr.title !== section.title)) return null;
        return (
          <div key={gi} style={{ marginBottom: 12 }}>
            {gr.title && gr.title !== section.title && (
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{gr.title}</div>
            )}
            <div style={{ display: "grid", gap: 0 }}>
              {(gr.questions || []).map((qq, qi) => (
                <QAItem key={qi} qq={qq} gr={gr} $={$} brd={$.brd} />
              ))}
            </div>
          </div>
        );
      })}
      {!!(section.comments || []).length && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: $.wr }}>Комментарии</div>
          <div style={{ display: "grid", gap: 6 }}>
            {section.comments.map((cmt, ci) => (
              <div key={ci} style={{ padding: "10px 12px", borderRadius: 10, background: $.bgI, fontSize: 12, lineHeight: 1.55 }}>{cmt}</div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
