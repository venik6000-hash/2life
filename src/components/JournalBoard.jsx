import { useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import JournalColumn from "./JournalColumn";
import Button from "./Button";
import {
  BOARD_STATUSES,
  JOURNAL_STATUS_LABELS,
  ASSIGNEE_FILTER_MODES,
  matchesAssigneeFilter,
  compareJournalDueAsc,
} from "../utils/journalRules";

const ASSIGNEE_LABELS = {
  mine: "Мои",
  team: "Команды",
  mine_and_team: "Мои + команда",
  all: "Все",
};

const TYPE_OPTIONS = [
  { id: "all", label: "Все типы" },
  { id: "task", label: "Задачи" },
  { id: "event", label: "События" },
];

const STAGE_FILTER_ALL = "all";
const STAGE_FILTER_NONE = "none";

const sortColumn = (status, items) => {
  if (status === "done") {
    return [...items].sort((a, b) => {
      const aT = a.updatedAt || a.completedAt || a.createdAt || "";
      const bT = b.updatedAt || b.completedAt || b.createdAt || "";
      return String(bT).localeCompare(String(aT));
    });
  }
  return [...items].sort(compareJournalDueAsc);
};

export default function JournalBoard({
  items = [],
  stages = [],
  usersById = {},
  currentUserId,
  readOnly = false,
  onEditItem,
  onCreateItem,
  onMoveItem,
  onDropItem,
  onCommentClick,
}) {
  const { $ } = useTheme();
  const [stageFilter, setStageFilter] = useState(STAGE_FILTER_ALL);
  const [assigneeFilter, setAssigneeFilter] = useState("mine_and_team");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (stageFilter === STAGE_FILTER_NONE) {
        if (item.stageId != null) return false;
      } else if (stageFilter !== STAGE_FILTER_ALL) {
        if (Number(item.stageId) !== Number(stageFilter)) return false;
      }
      if (!matchesAssigneeFilter(item, assigneeFilter, currentUserId)) return false;
      return true;
    });
  }, [items, stageFilter, assigneeFilter, typeFilter, currentUserId]);

  const columns = useMemo(() => {
    const buckets = {
      open: [],
      in_progress: [],
      waiting_client: [],
      done: [],
    };
    for (const item of filtered) {
      if (item.status === "cancelled") {
        buckets.done.push(item);
        continue;
      }
      if (buckets[item.status]) buckets[item.status].push(item);
    }
    return BOARD_STATUSES.map((s) => ({
      status: s,
      label: JOURNAL_STATUS_LABELS[s],
      items: sortColumn(s, buckets[s]),
    }));
  }, [filtered]);

  const selectStyle = {
    fontSize: 12,
    padding: "5px 8px",
    borderRadius: 6,
    border: `1px solid ${$.brd}`,
    background: $.bgI,
    color: $.tx,
    fontFamily: "inherit",
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: $.txS }}>
          Этап:
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={selectStyle}>
            <option value={STAGE_FILTER_ALL}>Все</option>
            <option value={STAGE_FILTER_NONE}>Без этапа</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.title || `Этап ${s.id}`}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: $.txS }}>
          Исполнитель:
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={selectStyle}>
            {ASSIGNEE_FILTER_MODES.map((m) => (
              <option key={m} value={m}>{ASSIGNEE_LABELS[m]}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: $.txS }}>
          Тип:
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <div style={{ marginLeft: "auto" }}>
          {!readOnly && (
            <Button
              size="sm"
              variant="solid"
              tone="accent"
              onClick={() => onCreateItem && onCreateItem({ type: "task", status: "open" })}
            >
              + Задача
            </Button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {columns.map((col) => (
          <JournalColumn
            key={col.status}
            status={col.status}
            label={col.label}
            items={col.items}
            stages={stages}
            usersById={usersById}
            readOnly={readOnly}
            onCardClick={onEditItem}
            onCardCommentClick={onCommentClick}
            onCardMove={onMoveItem}
            onDropCard={onDropItem}
            onCreate={(status) => onCreateItem && onCreateItem({ type: "task", status })}
          />
        ))}
      </div>
    </div>
  );
}
