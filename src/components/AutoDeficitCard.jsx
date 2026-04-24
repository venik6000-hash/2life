import { useTheme } from "../context/ThemeContext";
import Badge from "./Badge";
import Button from "./Button";
import Card from "./Card";
import Wrapper from "./Wrapper";

function DeficitBadgeButton({ deficit, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(deficit)}
      title={`Перейти к анализу: ${deficit.categoryName ? deficit.categoryName + " • " : ""}${deficit.markerName} • ${deficit.date}`}
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      <Badge c={deficit.status === "lo" ? "dn" : "wr"} ch={deficit.label} />
    </button>
  );
}

function DeficitPickerPanel({ items, selectedIds, onToggle }) {
  const { $ } = useTheme();

  return (
    <div style={{ marginTop: 10, padding: 10, border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bgI }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: $.txS, marginBottom: 8 }}>
        Какие дополнительные дефициты показывать в обзоре
      </div>
      <Wrapper columns="repeat(auto-fill,minmax(180px,1fr))" gap="sm">
        {items.map((item) => {
          const checked = selectedIds.includes(item.id);
          return (
            <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onToggle(item.id, e.target.checked)}
              />
              <span>{item.label}</span>
            </label>
          );
        })}
      </Wrapper>
    </div>
  );
}

export default function AutoDeficitCard({
  autoDef,
  shownDeficits,
  readOnly = false,
  pickerOpen = false,
  selectedIds = [],
  onTogglePicker,
  onToggleDeficit,
  onOpenDeficit,
}) {
  const { $ } = useTheme();

  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🧬 Дефициты</div>
      {!autoDef.lastDate ? (
        <div style={{ fontSize: 12, color: $.txM }}>Нет анализов для автоопределения дефицитов</div>
      ) : !autoDef.all.length ? (
        <div style={{ fontSize: 12, color: $.txM }}>По последней дате ({autoDef.lastDate}) явные дефициты не выявлены</div>
      ) : (
        <>
          <Wrapper dir="row" gap={6} wrap align="center">
            {shownDeficits.map((deficit) => (
              <DeficitBadgeButton key={deficit.id} deficit={deficit} onOpen={onOpenDeficit} />
            ))}
            {!readOnly && autoDef.hidden.length > 0 && (
              <Button variant="ghost" size="xs" tone="accent" onClick={onTogglePicker}>
                + ещё {autoDef.hidden.length}
              </Button>
            )}
          </Wrapper>
          <div style={{ fontSize: 11, color: $.txM, marginTop: 8 }}>
            По последним анализам от {autoDef.lastDate}
          </div>
          {!readOnly && pickerOpen && autoDef.all.length > 4 && (
            <DeficitPickerPanel
              items={autoDef.all.slice(4)}
              selectedIds={selectedIds}
              onToggle={onToggleDeficit}
            />
          )}
        </>
      )}
    </Card>
  );
}
