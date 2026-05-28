import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Wrapper from "./Wrapper";

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function JournalComments({ item, onAdd, readOnly = false }) {
  const { $ } = useTheme();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const comments = Array.isArray(item?.comments) ? item.comments : [];

  const handleSubmit = async () => {
    const body = text.trim();
    if (!body || !onAdd) return;
    try {
      setSending(true);
      await onAdd(item, body);
      setText("");
    } finally {
      setSending(false);
    }
  };

  if (readOnly && comments.length === 0) return null;

  return (
    <div style={{ marginTop: 4, paddingTop: 8, borderTop: `1px dashed ${$.brd}`, display: "grid", gap: 6 }}>
      {comments.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ fontSize: 12, color: $.tx }}>
              <span style={{ color: $.txS, fontSize: 11, marginRight: 6 }}>
                #{c.authorUserId || "—"} · {formatDate(c.createdAt)}
              </span>
              <span style={{ whiteSpace: "pre-wrap" }}>{c.body}</span>
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <Wrapper dir="row" gap="xs" align="flex-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Комментарий..."
            rows={2}
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: 6,
              border: `1px solid ${$.brd}`,
              background: $.bgC,
              color: $.tx,
              fontSize: 12,
              fontFamily: "inherit",
              resize: "vertical",
              minHeight: 36,
              boxSizing: "border-box",
            }}
          />
          <Button size="sm" variant="solid" tone="accent" onClick={handleSubmit} disabled={sending || !text.trim()}>
            Отправить
          </Button>
        </Wrapper>
      )}
    </div>
  );
}
