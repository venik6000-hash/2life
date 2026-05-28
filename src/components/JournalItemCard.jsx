import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Wrapper from "./Wrapper";
import JournalComments from "./JournalComments";
import {
  JOURNAL_OPEN_STATUSES,
  JOURNAL_STATUS_LABELS,
  JOURNAL_TERMINAL_STATUSES,
  JOURNAL_TYPE_LABELS,
  formatJournalDateRu,
} from "../utils/journalRules";

const STATUS_KEYS = [...JOURNAL_OPEN_STATUSES, ...JOURNAL_TERMINAL_STATUSES];

const typeTone = (type, $) =>
  type === "task" ? $.ac : type === "event" ? $.in : $.txS;

export default function JournalItemCard({
  item,
  stages = [],
  readOnly = false,
  onEdit,
  onStatusChange,
  onDelete,
  onComment,
  compact = false,
}) {
  const { $ } = useTheme();
  const stage = stages.find((s) => Number(s.id) === Number(item.stageId));
  const isNote = item.type === "note";

  const handleStatusChange = (e) => {
    if (readOnly) return;
    if (onStatusChange) onStatusChange(item, e.target.value);
  };

  const dueLine = !isNote && (item.dueDate || item.dueTime)
    ? `${formatJournalDateRu(item.dueDate) || "—"}${item.dueTime ? ` · ${String(item.dueTime).slice(0, 5)}` : ""}`
    : "";

  if (compact) {
    return (
      <div
        onClick={() => onEdit && onEdit(item)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          background: $.bgI,
          border: `1px solid ${$.brd}`,
          borderRadius: 7,
          cursor: "pointer",
        }}
      >
        <span style={{ color: typeTone(item.type, $), fontWeight: 700, fontSize: 11, minWidth: 60 }}>
          {JOURNAL_TYPE_LABELS[item.type] || item.type}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: $.tx }}>
          {item.title || "(без названия)"}
        </span>
        {dueLine && (
          <span style={{ fontSize: 11, color: $.txS, whiteSpace: "nowrap" }}>{dueLine}</span>
        )}
        <span style={{ fontSize: 10, color: $.txS, padding: "2px 8px", border: `1px solid ${$.brd}`, borderRadius: 999 }}>
          {JOURNAL_STATUS_LABELS[item.status] || item.status}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 12,
        background: $.bgI,
        border: `1px solid ${$.brd}`,
        borderRadius: 8,
        display: "grid",
        gap: 8,
      }}
    >
      <Wrapper dir="row" justify="space-between" align="flex-start" gap="sm" wrap>
        <Wrapper dir="row" align="center" gap="sm" wrap>
          <span style={{ color: typeTone(item.type, $), fontWeight: 700, fontSize: 11 }}>
            {JOURNAL_TYPE_LABELS[item.type] || item.type}
          </span>
          {stage && (
            <span style={{ fontSize: 11, color: $.txS }}>
              · {stage.title || `Этап ${stage.id}`}
            </span>
          )}
          {item.priority && item.priority !== "normal" && (
            <span style={{ fontSize: 10, color: $.wr, fontWeight: 700, textTransform: "uppercase" }}>
              {item.priority}
            </span>
          )}
        </Wrapper>
        {!isNote && (
          <select
            value={item.status || "open"}
            onChange={handleStatusChange}
            disabled={readOnly}
            style={{
              fontSize: 11,
              padding: "3px 6px",
              borderRadius: 6,
              border: `1px solid ${$.brd}`,
              background: $.bgC,
              color: $.tx,
              fontFamily: "inherit",
            }}
          >
            {STATUS_KEYS.map((s) => (
              <option key={s} value={s}>{JOURNAL_STATUS_LABELS[s] || s}</option>
            ))}
          </select>
        )}
      </Wrapper>
      {item.title && (
        <div style={{ fontSize: 14, fontWeight: 700, color: $.tx }}>{item.title}</div>
      )}
      {item.description && (
        <div style={{ fontSize: 12, color: $.txS, whiteSpace: "pre-wrap" }}>{item.description}</div>
      )}
      {dueLine && (
        <div style={{ fontSize: 11, color: $.txM }}>Срок: {dueLine}</div>
      )}
      {!readOnly && (
        <Wrapper dir="row" gap="xs" wrap>
          <Button size="xs" variant="ghost" onClick={() => onEdit && onEdit(item)}>Изменить</Button>
          <Button size="xs" variant="ghost" tone="danger" onClick={() => onDelete && onDelete(item)}>Удалить</Button>
        </Wrapper>
      )}
      <JournalComments item={item} onAdd={onComment} readOnly={readOnly} />
    </div>
  );
}
