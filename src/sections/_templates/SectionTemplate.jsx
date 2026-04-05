import { useSectionState } from "./useSectionState";

// Template section:
// - receives minimum contract from dashboard
// - uses local hook for section behavior
export default function SectionTemplate({
  stage,
  updateStage,
  cardStyle,
  theme,
  buttonStyle,
  todayLabel,
}) {
  const {
    isEditMode,
    setIsEditMode,
    sectionItems,
    addItem,
    updateItemTitle,
  } = useSectionState({ stage, updateStage, todayLabel });

  return (
    <div style={cardStyle()}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Новая секция</div>
        <button
          onClick={() => setIsEditMode((v) => !v)}
          style={{ ...buttonStyle("g"), fontSize: 11, marginLeft: "auto" }}
        >
          {isEditMode ? "Готово" : "Редактировать"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {sectionItems.map((item, index) => (
          <div
            key={index}
            style={{
              border: `1px solid ${theme.brd}`,
              background: theme.bgI,
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            {isEditMode ? (
              <input
                value={item.title || ""}
                onChange={(e) => updateItemTitle(index, e.target.value)}
                style={{
                  width: "100%",
                  border: `1px solid ${theme.brd}`,
                  borderRadius: 6,
                  background: theme.bgC,
                  color: theme.tx,
                  padding: "6px 8px",
                  fontFamily: "inherit",
                  fontSize: 12,
                }}
              />
            ) : (
              <div style={{ fontSize: 13 }}>{item.title || "—"}</div>
            )}
          </div>
        ))}
      </div>

      <button onClick={addItem} style={{ ...buttonStyle("g"), marginTop: 10, fontSize: 11 }}>
        + Добавить
      </button>
    </div>
  );
}
