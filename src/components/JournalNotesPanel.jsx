import { useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import { formatJournalDateRu } from "../utils/journalRules";

const formatCreated = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
};

const noteHasQuotedTask = (note, allItems) => {
  if (!note?.id) return false;
  return allItems.some((it) => {
    const refId = it?.metadata?.quotedFromNoteId;
    return refId != null && Number(refId) === Number(note.id);
  });
};

export default function JournalNotesPanel({
  notes = [],
  allItems = [],
  stages = [],
  readOnly = false,
  onEditNote,
  onAddNote,
  onQuoteToTask,
  onDeleteNote,
}) {
  const { $ } = useTheme();
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () => [...notes].sort((a, b) => {
      const aT = a.createdAt || "";
      const bT = b.createdAt || "";
      return String(bT).localeCompare(String(aT));
    }),
    [notes]
  );

  return (
    <div
      style={{
        background: $.bgC,
        border: `1px solid ${$.brd}`,
        borderRadius: 10,
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "transparent",
            border: "none",
            color: $.tx,
            cursor: "pointer",
            font: "inherit",
            fontSize: 13,
            fontWeight: 700,
            padding: 0,
          }}
        >
          {open ? "▾" : "▸"} Заметки · {sorted.length}
        </button>
        {!readOnly && (
          <Button size="xs" variant="ghost" tone="accent" onClick={onAddNote}>
            + Добавить заметку
          </Button>
        )}
      </div>
      {open && (
        <div style={{ display: "grid", gap: 6 }}>
          {sorted.length === 0 && (
            <div style={{ fontSize: 12, color: $.txM }}>Заметок пока нет.</div>
          )}
          {sorted.map((note) => {
            const stage = stages.find((s) => Number(s.id) === Number(note.stageId));
            const quoted = noteHasQuotedTask(note, allItems);
            const text = note.description || note.title || "";
            return (
              <div
                key={note.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "6px 8px",
                  borderRadius: 7,
                  background: $.bgI,
                  border: `1px solid ${$.brd}`,
                }}
              >
                <span style={{ fontSize: 11, color: $.txS, minWidth: 48 }}>
                  {formatCreated(note.createdAt)}
                </span>
                <span style={{ fontSize: 11, color: $.txS, minWidth: 38 }}>
                  #{note.createdBy || "—"}
                </span>
                <div
                  onClick={() => onEditNote && onEditNote(note)}
                  style={{ flex: 1, fontSize: 12, color: $.tx, cursor: "pointer", whiteSpace: "pre-wrap" }}
                >
                  {text || "(пустая заметка)"}
                </div>
                {stage && (
                  <span style={{ fontSize: 10, color: $.txS, padding: "1px 6px", border: `1px solid ${$.brd}`, borderRadius: 999 }}>
                    {stage.title || `Этап ${stage.id}`}
                  </span>
                )}
                {quoted && (
                  <span title="Есть связанные задачи" style={{ fontSize: 11, color: $.txS }}>🔗</span>
                )}
                {!readOnly && onQuoteToTask && (
                  <button
                    onClick={() => onQuoteToTask(note)}
                    title="Создать задачу из заметки"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: $.in,
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: 11,
                    }}
                  >
                    → задача
                  </button>
                )}
                {!readOnly && onDeleteNote && (
                  <button
                    onClick={() => onDeleteNote(note)}
                    title="Удалить заметку"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: $.dn,
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: 11,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
