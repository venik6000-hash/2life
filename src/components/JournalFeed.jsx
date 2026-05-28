import { useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import Button from "./Button";
import Wrapper from "./Wrapper";
import SectionTitle from "./SectionTitle";
import JournalItemCard from "./JournalItemCard";
import { JOURNAL_OPEN_STATUSES } from "../utils/journalRules";

const TYPE_TABS = [
  { id: "all", label: "Все" },
  { id: "task", label: "Задачи" },
  { id: "event", label: "События" },
  { id: "note", label: "Заметки" },
];

export default function JournalFeed({
  stages = [],
  items = [],
  readOnly = false,
  onEdit,
  onDelete,
  onComment,
}) {
  const { $ } = useTheme();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [stageFilter, setStageFilter] = useState("all");

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (typeFilter !== "all" && it.type !== typeFilter) return false;
      if (statusFilter === "open") {
        // notes are always "done", exclude them from open filter; tasks/events must be in open statuses
        if (it.type === "note") return false;
        if (!JOURNAL_OPEN_STATUSES.includes(String(it.status || ""))) return false;
      }
      if (stageFilter !== "all") {
        if (stageFilter === "none") {
          if (it.stageId != null) return false;
        } else if (Number(it.stageId) !== Number(stageFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [items, typeFilter, statusFilter, stageFilter]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const aT = a.updatedAt || a.createdAt || "";
      const bT = b.updatedAt || b.createdAt || "";
      return String(bT).localeCompare(String(aT));
    }),
    [filtered],
  );

  const selectStyle = {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 6,
    border: `1px solid ${$.brd}`,
    background: $.bgI,
    color: $.tx,
    fontFamily: "inherit",
  };

  return (
    <Card size="md">
      <SectionTitle>Журнал · {sorted.length}</SectionTitle>
      <Wrapper dir="row" gap="sm" wrap marginTop="sm" align="center">
        <Wrapper dir="row" gap="xs" wrap>
          {TYPE_TABS.map((t) => (
            <Button
              key={t.id}
              size="xs"
              variant="pill"
              active={typeFilter === t.id}
              onClick={() => setTypeFilter(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </Wrapper>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="open">Только открытые</option>
          <option value="all">Все статусы</option>
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="all">Все этапы</option>
          <option value="none">Без этапа</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.title || `Этап ${s.id}`}</option>
          ))}
        </select>
      </Wrapper>
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {sorted.length === 0 ? (
          <div style={{ color: $.txM, fontSize: 12 }}>Ничего не найдено по фильтрам.</div>
        ) : (
          sorted.map((item) => (
            <JournalItemCard
              key={item.id}
              item={item}
              stages={stages}
              readOnly={readOnly}
              onEdit={onEdit}
              onDelete={onDelete}
              onComment={onComment}
            />
          ))
        )}
      </div>
    </Card>
  );
}
