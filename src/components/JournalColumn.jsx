import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import JournalCard from "./JournalCard";

const COLUMN_TONE = {
  open: "txS",
  in_progress: "in",
  waiting_client: "wr",
  done: "ac",
};

export default function JournalColumn({
  status,
  label,
  items = [],
  stages = [],
  usersById = {},
  readOnly = false,
  onCardClick,
  onCardCommentClick,
  onCardMove,
  onCardDragStart,
  onCardDragEnd,
  onDropCard,
  onCreate,
}) {
  const { $ } = useTheme();
  const [highlighted, setHighlighted] = useState(false);
  const accent = $[COLUMN_TONE[status]] || $.txS;

  const handleDragOver = (e) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!highlighted) setHighlighted(true);
  };

  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setHighlighted(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setHighlighted(false);
    if (readOnly || !onDropCard) return;
    let payload = null;
    try {
      payload = JSON.parse(e.dataTransfer.getData("application/json") || "null");
    } catch (_) {
      payload = null;
    }
    if (!payload || payload.type !== "journal-item") return;
    if (payload.fromStatus === status) return;
    onDropCard({ id: payload.id, fromStatus: payload.fromStatus, toStatus: status });
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        background: $.bgC,
        border: `1px solid ${highlighted ? accent : $.brd}`,
        borderRadius: 10,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 240,
        transition: "border-color .12s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: $.txM, fontWeight: 700 }}>
          {items.length}
        </span>
        {!readOnly && onCreate && (
          <button
            onClick={() => onCreate(status)}
            title={`Создать задачу в «${label}»`}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: `1px solid ${$.brd}`,
              color: $.txS,
              borderRadius: 6,
              padding: "1px 8px",
              fontSize: 13,
              cursor: "pointer",
              font: "inherit",
              lineHeight: 1.4,
            }}
          >
            +
          </button>
        )}
      </div>
      <div style={{ display: "grid", gap: 6, overflowY: "auto", maxHeight: "calc(100vh - 320px)" }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 12, color: $.txM, padding: 12, textAlign: "center" }}>
            Пусто
          </div>
        ) : (
          items.map((item) => (
            <JournalCard
              key={item.id}
              item={item}
              stages={stages}
              usersById={usersById}
              readOnly={readOnly}
              onClick={onCardClick}
              onCommentClick={onCardCommentClick}
              onMove={onCardMove}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}
