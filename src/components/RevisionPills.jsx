import { useTheme } from "../context/ThemeContext";

// Renders a row of revision/version pills with optional add and delete controls.
// onDelete is only shown when provided and revisions.length > 1.
export default function RevisionPills({
  revisions,
  activeIndex,
  onSelect,
  onDelete,
  onAdd,
  addLabel = "+ Корректировка",
  readOnly = false,
}) {
  const { $ } = useTheme();

  const pill = (active) => ({
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? $.ac : $.brd}`,
    background: active ? `${$.ac}22` : $.bgI,
    color: active ? $.ac : $.txS,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "inherit",
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {revisions.map((r, ri) => (
        <span key={ri} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <button onClick={() => onSelect(ri)} style={pill(ri === activeIndex)}>
            {r.label}{r.date ? ` (${r.date})` : ""}
          </button>
          {!readOnly && revisions.length > 1 && onDelete && (
            <button
              onClick={() => onDelete(ri)}
              style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 11, padding: "2px 3px" }}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {!readOnly && onAdd && (
        <button onClick={onAdd} style={pill(false)}>{addLabel}</button>
      )}
    </div>
  );
}
