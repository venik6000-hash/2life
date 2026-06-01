import { useEffect, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import Button from "./Button";

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 360;
const VIEWPORT_MARGIN = 8;

const formatStamp = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const computePosition = (anchorRect) => {
  if (!anchorRect) return { top: 80, left: 80 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchorRect.left;
  if (left + POPUP_WIDTH + VIEWPORT_MARGIN > vw) {
    left = Math.max(VIEWPORT_MARGIN, vw - POPUP_WIDTH - VIEWPORT_MARGIN);
  }
  let top = anchorRect.bottom + 6;
  if (top + POPUP_MAX_HEIGHT + VIEWPORT_MARGIN > vh) {
    top = Math.max(VIEWPORT_MARGIN, anchorRect.top - POPUP_MAX_HEIGHT - 6);
  }
  return { top, left };
};

export default function JournalCommentsPopup({
  item,
  anchorRect,
  readOnly = false,
  onClose,
  onAddComment,
  usersById = {},
}) {
  const { $ } = useTheme();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const containerRef = useRef(null);
  const composerRef = useRef(null);
  const listRef = useRef(null);

  const comments = Array.isArray(item?.comments) ? item.comments : [];
  const pos = computePosition(anchorRect);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose && onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length]);

  useEffect(() => {
    if (composerRef.current && !readOnly) composerRef.current.focus();
  }, [readOnly]);

  const submit = async () => {
    const body = text.trim();
    if (!body || !onAddComment) return;
    setErr("");
    try {
      setSending(true);
      await onAddComment(item, body);
      setText("");
    } catch (e) {
      setErr(e.message || "Не удалось отправить комментарий");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "transparent" }}
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Комментарии"
        style={{
          position: "absolute",
          top: pos.top,
          left: pos.left,
          width: POPUP_WIDTH,
          maxHeight: POPUP_MAX_HEIGHT,
          background: $.bgC,
          border: `1px solid ${$.brd}`,
          borderRadius: 10,
          boxShadow: $.sh,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${$.brd}`, fontSize: 12, color: $.txS, fontWeight: 600 }}>
          Комментарии · {comments.length}
        </div>
        <div
          ref={listRef}
          style={{ padding: "8px 12px", overflowY: "auto", flex: 1, display: "grid", gap: 8, fontSize: 12, color: $.tx, minHeight: 60 }}
        >
          {comments.length === 0 ? (
            <div style={{ color: $.txM }}>Пока нет комментариев.</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} style={{ display: "grid", gap: 2 }}>
                <div style={{ color: $.txS, fontSize: 11 }}>
                  {usersById[c.authorUserId]?.displayName || usersById[c.authorUserId]?.username || `#${c.authorUserId || "—"}`} · {formatStamp(c.createdAt)}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
              </div>
            ))
          )}
        </div>
        {!readOnly && (
          <div style={{ padding: 10, borderTop: `1px solid ${$.brd}`, display: "grid", gap: 6 }}>
            {err && <div style={{ color: $.dn, fontSize: 11 }}>{err}</div>}
            <textarea
              ref={composerRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder="Написать комментарий... (Cmd/Ctrl+Enter — отправить)"
              rows={2}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${$.brd}`,
                background: $.bgI,
                color: $.tx,
                fontSize: 12,
                fontFamily: "inherit",
                resize: "vertical",
                minHeight: 40,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <Button size="sm" variant="ghost" onClick={onClose}>Закрыть</Button>
              <Button size="sm" variant="solid" tone="accent" onClick={submit} disabled={sending || !text.trim()}>
                {sending ? "Отправка..." : "Отправить"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
