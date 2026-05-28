import { useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import Modal from "./Modal";
import Button from "./Button";
import Input from "./Input";
import Wrapper from "./Wrapper";
import {
  JOURNAL_OPEN_STATUSES,
  JOURNAL_STATUS_LABELS,
  JOURNAL_TERMINAL_STATUSES,
  JOURNAL_TYPE_LABELS,
} from "../utils/journalRules";

const STATUS_KEYS = [...JOURNAL_OPEN_STATUSES, ...JOURNAL_TERMINAL_STATUSES];
const TYPE_TABS = ["task", "event", "note"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

const toCleanString = (v) => (v == null ? "" : String(v));

export default function JournalItemEditor({
  stages = [],
  initialType,
  initialStageId,
  item,
  onClose,
  onSave,
}) {
  const { $ } = useTheme();
  const isEditing = !!item?.id;

  const initial = useMemo(() => {
    if (item) {
      return {
        type: item.type || "task",
        stageId: item.stageId == null ? "" : String(item.stageId),
        title: toCleanString(item.title),
        description: toCleanString(item.description),
        status: item.status || "open",
        dueDate: toCleanString(item.dueDate).slice(0, 10),
        dueTime: toCleanString(item.dueTime).slice(0, 5),
        assigneeUserId: item.assigneeUserId == null ? "" : String(item.assigneeUserId),
        isTeamTask: !!item.isTeamTask,
        priority: item.priority || "normal",
      };
    }
    return {
      type: initialType || "task",
      stageId: initialStageId == null ? "" : String(initialStageId),
      title: "",
      description: "",
      status: "open",
      dueDate: "",
      dueTime: "",
      assigneeUserId: "",
      isTeamTask: false,
      priority: "normal",
    };
  }, [item, initialType, initialStageId]);

  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const isNote = state.type === "note";

  const update = (patch) => setState((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setErr("");
    const payload = {
      type: state.type,
      stageId: state.stageId === "" ? null : Number(state.stageId),
      title: state.title.trim(),
      description: state.description.trim(),
      status: isNote ? "done" : state.status,
      dueDate: isNote ? "" : state.dueDate,
      dueTime: isNote ? "" : state.dueTime,
      assigneeUserId: isNote || state.assigneeUserId === ""
        ? null
        : Number(state.assigneeUserId),
      isTeamTask: isNote ? false : !!state.isTeamTask,
      priority: state.priority || "normal",
    };
    if (!isNote && !payload.title) {
      setErr("Введите название");
      return;
    }
    if (isNote && !payload.title && !payload.description) {
      setErr("Заполните заметку");
      return;
    }
    try {
      setSaving(true);
      await onSave(payload);
    } catch (e) {
      setErr(e.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const labelStyle = { fontSize: 11, color: $.txS, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 };
  const fieldStyle = {
    padding: "6px 10px",
    borderRadius: 6,
    border: `1px solid ${$.brd}`,
    background: $.bgI,
    color: $.tx,
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <Modal onClose={onClose} size="md">
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: $.tx }}>
          {isEditing ? "Редактирование записи" : "Новая запись"}
        </div>

        {!isEditing && (
          <Wrapper dir="row" gap="xs" wrap>
            {TYPE_TABS.map((t) => (
              <Button
                key={t}
                size="sm"
                variant="pill"
                active={state.type === t}
                onClick={() => update({ type: t })}
              >
                {JOURNAL_TYPE_LABELS[t]}
              </Button>
            ))}
          </Wrapper>
        )}

        <div>
          <div style={labelStyle}>Название</div>
          <div style={{ marginTop: 4 }}>
            <Input
              value={state.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder={isNote ? "Заголовок (необязательно)" : "Кратко опишите задачу"}
            />
          </div>
        </div>

        <div>
          <div style={labelStyle}>Описание</div>
          <textarea
            value={state.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Подробности"
            rows={3}
            style={{ ...fieldStyle, marginTop: 4, resize: "vertical", minHeight: 60 }}
          />
        </div>

        {!isNote && (
          <>
            <Wrapper dir="row" gap="sm" wrap>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={labelStyle}>Этап</div>
                <select
                  value={state.stageId}
                  onChange={(e) => update({ stageId: e.target.value })}
                  style={{ ...fieldStyle, marginTop: 4 }}
                >
                  <option value="">— Не выбран —</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.title || `Этап ${s.id}`}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={labelStyle}>Статус</div>
                <select
                  value={state.status}
                  onChange={(e) => update({ status: e.target.value })}
                  style={{ ...fieldStyle, marginTop: 4 }}
                >
                  {STATUS_KEYS.map((s) => (
                    <option key={s} value={s}>{JOURNAL_STATUS_LABELS[s] || s}</option>
                  ))}
                </select>
              </div>
            </Wrapper>

            <Wrapper dir="row" gap="sm" wrap>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={labelStyle}>Дата</div>
                <input
                  type="date"
                  value={state.dueDate}
                  onChange={(e) => update({ dueDate: e.target.value })}
                  style={{ ...fieldStyle, marginTop: 4 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={labelStyle}>Время</div>
                <input
                  type="time"
                  value={state.dueTime}
                  onChange={(e) => update({ dueTime: e.target.value })}
                  style={{ ...fieldStyle, marginTop: 4 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={labelStyle}>Приоритет</div>
                <select
                  value={state.priority}
                  onChange={(e) => update({ priority: e.target.value })}
                  style={{ ...fieldStyle, marginTop: 4 }}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </Wrapper>

            <Wrapper dir="row" gap="sm" wrap align="flex-end">
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={labelStyle}>Исполнитель (ID сотрудника)</div>
                <input
                  type="number"
                  value={state.assigneeUserId}
                  onChange={(e) => update({ assigneeUserId: e.target.value })}
                  placeholder="например, 42"
                  style={{ ...fieldStyle, marginTop: 4 }}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: $.tx, paddingBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={state.isTeamTask}
                  onChange={(e) => update({ isTeamTask: e.target.checked, assigneeUserId: e.target.checked ? "" : state.assigneeUserId })}
                />
                Командная задача
              </label>
            </Wrapper>
          </>
        )}

        {err && <div style={{ color: $.dn, fontSize: 12 }}>{err}</div>}

        <Wrapper dir="row" gap="sm" justify="flex-end">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="solid" tone="accent" onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </Wrapper>
      </div>
    </Modal>
  );
}
