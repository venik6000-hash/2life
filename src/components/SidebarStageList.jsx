import { useTheme } from "../context/ThemeContext";
import Button from "./Button";

function SidebarStageItem({ stage, active, canEdit, onSelect, onDelete }) {
  const { $ } = useTheme();

  return (
    <div
      onClick={onSelect}
      style={{
        padding: "7px 8px",
        borderRadius: 7,
        cursor: "pointer",
        marginBottom: 3,
        fontSize: 12,
        background: active ? $.acD : "transparent",
        color: active ? $.ac : $.txS,
        fontWeight: active ? 600 : 400,
        display: "flex",
        gap: 7,
        alignItems: "center",
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: active ? $.ac : $.brd,
          color: active ? "#fff" : $.txM,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {stage.id}
      </span>
      <div style={{ overflow: "hidden", flex: 1 }}>
        <div style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{stage.title}</div>
        <div style={{ fontSize: 10, color: $.txM }}>{stage.doctor || "Врач?"}</div>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          title="Удалить этап"
          style={{ background: "none", border: "none", color: $.dn, cursor: "pointer", fontSize: 11, padding: "2px 4px", lineHeight: 1, flexShrink: 0 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default function SidebarStageList({
  stages,
  activeIndex,
  canEdit,
  onSelectStage,
  onDeleteStage,
  onCreateStage,
}) {
  const { $ } = useTheme();

  return (
    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${$.brd}` }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, color: $.txM, marginBottom: 6 }}>
        Этапы
      </div>
      {stages.map((stage, index) => (
        <SidebarStageItem
          key={stage.id}
          stage={stage}
          active={index === activeIndex}
          canEdit={canEdit}
          onSelect={() => onSelectStage(index)}
          onDelete={() => onDeleteStage(index)}
        />
      ))}
      {canEdit && (
        <div style={{ marginTop: 4 }}>
          <Button variant="ghost" size="sm" fullWidth onClick={onCreateStage}>+ Новый этап</Button>
        </div>
      )}
    </div>
  );
}
