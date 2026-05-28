import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import {
  BOARD_STATUSES,
  JOURNAL_STATUS_LABELS,
  JOURNAL_TYPE_LABELS,
  formatJournalDateRu,
  getTodayIso,
  normalizeJournalDate,
} from "../utils/journalRules";

const typeTone = (type, $) =>
  type === "task" ? $.ac : type === "event" ? $.in : $.txS;

const userName = (usersById, id) => {
  if (!id) return "";
  const u = usersById?.[id];
  if (!u) return `#${id}`;
  return u.displayName || u.username || `#${id}`;
};

export default function JournalCard({
  item,
  stages = [],
  usersById = {},
  readOnly = false,
  onClick,
  onCommentClick,
  onMove,
  onDragStart,
  onDragEnd,
}) {
  const { $ } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const stage = stages.find((s) => Number(s.id) === Number(item.stageId));
  const today = getTodayIso();
  const due = normalizeJournalDate(item?.dueDate);
  const isOpenish = ["open", "in_progress", "waiting_client"].includes(item?.status);
  const isCancelled = item?.status === "cancelled";
  const isOverdue = isOpenish && due && due < today;
  const isToday = isOpenish && due && due === today;

  const priorityBorder =
    item?.priority === "high" || item?.priority === "urgent" ? $.dn : $.brd;

  const dueLine = (item?.dueDate || item?.dueTime)
    ? `${formatJournalDateRu(item.dueDate) || "—"}${item.dueTime ? ` · ${String(item.dueTime).slice(0, 5)}` : ""}`
    : "";

  const commentCount = Array.isArray(item?.comments) ? item.comments.length : 0;
  const assigneeLabel = item?.isTeamTask
    ? "Команда"
    : userName(usersById, item?.assigneeUserId) || "Не назначен";
  const creatorName = userName(usersById, item?.createdBy);

  const handleDragStart = (e) => {
    if (readOnly) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ type: "journal-item", id: item.id, fromStatus: item.status })
    );
    if (onDragStart) onDragStart(item);
  };

  const handleDragEnd = () => {
    if (onDragEnd) onDragEnd(item);
  };

  const triggerMove = (status) => {
    setMenuOpen(false);
    if (onMove && status !== item.status) onMove(item, status);
  };

  const toggleMenu = (e) => {
    e.stopPropagation();
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    setMenuOpen(true);
  };

  const handleCommentClick = (e) => {
    e.stopPropagation();
    if (!onCommentClick) return;
    const anchorRect = e.currentTarget.getBoundingClientRect();
    onCommentClick(item, anchorRect);
  };

  const cardClick = (e) => {
    if (e.target.closest("[data-card-icon]")) return;
    if (onClick) onClick(item);
  };

  return (
    <div
      draggable={!readOnly}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={cardClick}
      data-journal-card-id={item.id}
      style={{
        background: $.bgI,
        border: `1px solid ${$.brd}`,
        borderLeft: `3px solid ${priorityBorder}`,
        borderRadius: 8,
        padding: "10px 12px",
        cursor: readOnly ? "default" : "grab",
        display: "grid",
        gap: 6,
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ color: typeTone(item.type, $), fontWeight: 700, fontSize: 11, letterSpacing: 0.3 }}>
          {(JOURNAL_TYPE_LABELS[item.type] || item.type).toUpperCase()}
        </span>
        {stage && (
          <span style={{ fontSize: 11, color: $.txS }}>
            · {stage.title || `Этап ${stage.id}`}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {isCancelled && (
            <span style={{ fontSize: 10, color: $.txS, padding: "1px 6px", border: `1px solid ${$.brd}`, borderRadius: 999 }}>
              отменено
            </span>
          )}
          {!isCancelled && isOverdue && (
            <span style={{ fontSize: 11, color: $.dn, fontWeight: 700 }}>🔴 просрочено</span>
          )}
          {!isCancelled && !isOverdue && isToday && (
            <span style={{ fontSize: 11, color: $.wr, fontWeight: 700 }}>🟡 сегодня</span>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: $.tx,
          lineHeight: 1.25,
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
          overflow: "hidden",
        }}
      >
        {item.title || "(без названия)"}
      </div>

      {item.description && (
        <div
          title={item.description}
          style={{
            fontSize: 12,
            color: $.txS,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.description}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: $.txM, flexWrap: "wrap" }}>
        <span
          title={item?.isTeamTask ? "Командная задача" : "Исполнитель"}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: $.txS }}
        >
          {item?.isTeamTask ? "👥" : "👤"} {assigneeLabel}
        </span>
        {creatorName && (
          <span title="Автор задачи" style={{ color: $.txM }}>
            · автор: {creatorName}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: $.txM, marginTop: 2 }}>
        {dueLine && <span>📅 {dueLine}</span>}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {commentCount > 0 && (
            <button
              data-card-icon="comments"
              onClick={handleCommentClick}
              style={{
                background: "transparent",
                border: "none",
                color: $.txS,
                cursor: "pointer",
                padding: 0,
                font: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              💬 {commentCount}
            </button>
          )}
          {commentCount === 0 && !readOnly && onCommentClick && (
            <button
              data-card-icon="comments-empty"
              onClick={handleCommentClick}
              title="Добавить комментарий"
              style={{
                background: "transparent",
                border: "none",
                color: $.txM,
                cursor: "pointer",
                padding: 0,
                font: "inherit",
              }}
            >
              💬
            </button>
          )}
          {!readOnly && onMove && (
            <span style={{ position: "relative" }}>
              <button
                data-card-icon="menu"
                onClick={toggleMenu}
                title="Переместить"
                style={{
                  background: "transparent",
                  border: "none",
                  color: $.txM,
                  cursor: "pointer",
                  padding: 0,
                  font: "inherit",
                }}
              >
                ⋯
              </button>
              {menuOpen && menuPos && (
                <>
                <div
                  data-card-icon="menu-backdrop"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
                  style={{ position: "fixed", inset: 0, zIndex: 50 }}
                />
                <div
                  data-card-icon="menu-popover"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "fixed",
                    right: menuPos.right,
                    top: menuPos.top,
                    background: $.bgC,
                    border: `1px solid ${$.brd}`,
                    borderRadius: 6,
                    boxShadow: $.sh,
                    padding: 4,
                    display: "grid",
                    gap: 2,
                    zIndex: 51,
                    minWidth: 160,
                  }}
                >
                  {BOARD_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => triggerMove(s)}
                      disabled={s === item.status}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: s === item.status ? $.txM : $.tx,
                        textAlign: "left",
                        padding: "4px 8px",
                        borderRadius: 4,
                        cursor: s === item.status ? "default" : "pointer",
                        font: "inherit",
                      }}
                    >
                      → {JOURNAL_STATUS_LABELS[s]}
                    </button>
                  ))}
                  <button
                    onClick={() => triggerMove("cancelled")}
                    disabled={item.status === "cancelled"}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: item.status === "cancelled" ? $.txM : $.dn,
                      textAlign: "left",
                      padding: "4px 8px",
                      borderRadius: 4,
                      cursor: item.status === "cancelled" ? "default" : "pointer",
                      font: "inherit",
                    }}
                  >
                    × Отменить
                  </button>
                </div>
                </>
              )}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
