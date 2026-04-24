import { useTheme } from "../context/ThemeContext";
import Card from "./Card";

function LabOrderDropLine({ position }) {
  const { $ } = useTheme();

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        height: 3,
        borderRadius: 999,
        background: $.ac,
        pointerEvents: "none",
        ...(position === "after" ? { bottom: 0 } : { top: 0 }),
      }}
    />
  );
}

function DragHandle({ groupIndex, onDragStart, onDragEnd }) {
  const { $ } = useTheme();

  return (
    <span
      draggable
      onDragStart={(event) => onDragStart(event, groupIndex)}
      onDragEnd={onDragEnd}
      onClick={(event) => event.stopPropagation()}
      title="Перетащить блок"
      style={{ fontSize: 14, letterSpacing: 1, color: $.txM, cursor: "grab", userSelect: "none", lineHeight: 1 }}
    >
      ⋮⋮
    </span>
  );
}

export default function LabOrderGroupCard({
  group,
  groupIndex,
  selectedMarkers = [],
  open = false,
  dragSource = false,
  dropTarget = false,
  dropPosition = "before",
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onToggleOpen,
  onToggleSimple,
  onSetGroupAll,
  onToggleMarker,
}) {
  const { $ } = useTheme();
  const selectedCount = selectedMarkers.length;
  const isSimple = !!group.simple;
  const allSelected = group.markers.length > 0 && selectedCount === group.markers.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <div
      onDragOver={(event) => onDragOver(event, groupIndex)}
      onDrop={(event) => onDrop(event, groupIndex)}
      style={{
        marginBottom: 8,
        position: "relative",
        opacity: dragSource ? 0.65 : 1,
        boxShadow: dropTarget ? `0 0 0 1px ${$.ac} inset` : "none",
        transition: "box-shadow .12s ease, opacity .12s ease",
      }}
    >
      <Card size="none" clip>
        {dropTarget && <LabOrderDropLine position={dropPosition} />}
        {isSimple ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: selectedCount > 0 ? $.acD : "transparent", transition: "background .15s" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer" }}>
              <input type="checkbox" checked={selectedCount > 0} onChange={() => onToggleSimple(group.name)} style={{ width: 15, height: 15, cursor: "pointer", accentColor: $.ac, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: selectedCount > 0 ? $.ac : $.tx }}>{group.name}</span>
            </label>
            <DragHandle groupIndex={groupIndex} onDragStart={onDragStart} onDragEnd={onDragEnd} />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: open ? `1px solid ${$.brd}` : "none", background: selectedCount > 0 ? $.acD : "transparent", transition: "background .15s" }}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={() => onSetGroupAll(group.name, group.markers, allSelected)}
                onClick={(event) => event.stopPropagation()}
                style={{ width: 15, height: 15, cursor: "pointer", accentColor: $.ac, flexShrink: 0 }}
              />
              <div onClick={() => onToggleOpen(group.name)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: selectedCount > 0 ? $.ac : $.tx }}>{group.name}</span>
                {selectedCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: $.ac, color: "#fff" }}>{selectedCount}</span>}
              </div>
              <div onClick={() => onToggleOpen(group.name)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: $.txM }}>{group.markers.length} пок.</span>
                <span style={{ fontSize: 11, color: $.txM }}>{open ? "▲" : "▼"}</span>
              </div>
              <DragHandle groupIndex={groupIndex} onDragStart={onDragStart} onDragEnd={onDragEnd} />
            </div>
            {open && (
              <div style={{ padding: "10px 14px 12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 2 }}>
                  {group.markers.map((marker) => {
                    const checked = selectedMarkers.includes(marker);
                    return (
                      <label key={marker} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: checked ? $.acD : "transparent", fontSize: 12, transition: "background .1s" }}>
                        <input type="checkbox" checked={checked} onChange={() => onToggleMarker(group.name, marker)} style={{ width: 13, height: 13, cursor: "pointer", accentColor: $.ac, flexShrink: 0 }} />
                        <span style={{ color: checked ? $.ac : $.tx, lineHeight: 1.3 }}>{marker}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
