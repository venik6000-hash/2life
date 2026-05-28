import Card from "./Card";
import Button from "./Button";
import Wrapper from "./Wrapper";
import SectionTitle from "./SectionTitle";
import { useTheme } from "../context/ThemeContext";
import {
  JOURNAL_STATUS_LABELS,
  JOURNAL_TYPE_LABELS,
  formatJournalDateRu,
} from "../utils/journalRules";

const typeTone = (type) => (type === "task" ? "ac" : type === "event" ? "in" : "txS");

export default function JournalCurrentPanel({
  items = [],
  readOnly = false,
  onAddTask,
  onAddEvent,
  onAddNote,
  onEdit,
}) {
  const { $ } = useTheme();

  return (
    <Card size="md">
      <Wrapper dir="row" justify="space-between" align="center" gap="sm" wrap>
        <SectionTitle>Актуальное · {items.length}</SectionTitle>
        {!readOnly && (
          <Wrapper dir="row" gap="xs" wrap>
            <Button size="sm" variant="soft" tone="accent" onClick={onAddTask}>+ Задача</Button>
            <Button size="sm" variant="soft" tone="info" onClick={onAddEvent}>+ Событие</Button>
            <Button size="sm" variant="soft" tone="neutral" onClick={onAddNote}>+ Заметка</Button>
          </Wrapper>
        )}
      </Wrapper>
      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
        {items.length === 0 ? (
          <div style={{ color: $.txM, fontSize: 12, padding: "8px 0" }}>
            На сегодня ничего не запланировано.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
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
              <span style={{ color: $[typeTone(item.type)], fontWeight: 700, fontSize: 11, minWidth: 60 }}>
                {JOURNAL_TYPE_LABELS[item.type] || item.type}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: $.tx, fontWeight: 600 }}>
                {item.title || "(без названия)"}
              </span>
              <span style={{ fontSize: 11, color: $.txS, whiteSpace: "nowrap" }}>
                {formatJournalDateRu(item.dueDate)}
                {item.dueTime ? ` ${String(item.dueTime).slice(0, 5)}` : ""}
              </span>
              <span style={{ fontSize: 10, color: $.txS, padding: "2px 8px", border: `1px solid ${$.brd}`, borderRadius: 999 }}>
                {JOURNAL_STATUS_LABELS[item.status] || item.status}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
