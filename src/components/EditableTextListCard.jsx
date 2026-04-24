import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import Button from "./Button";
import Ed from "./Ed";

export default function EditableTextListCard({
  title,
  items,
  addLabel,
  onAdd,
  onSaveItem,
  onDeleteItem,
  readOnly = false,
  numbered = true,
}) {
  const { $ } = useTheme();

  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {(items || []).map((item, index) => (
        <div
          key={`${title}-${index}`}
          style={{
            padding: "5px 0",
            borderBottom: `1px solid ${$.brd}`,
            fontSize: 13,
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          {numbered && <span style={{ color: $.ac, fontWeight: 700 }}>{index + 1}.</span>}
          <div style={{ flex: 1 }}>
            <Ed value={item} editKey={`${title}-${index}`} onSave={value => onSaveItem(index, value)} readOnly={readOnly} />
          </div>
          {!readOnly && (
            <Button variant="bare" tone="danger" size="xs" onClick={() => onDeleteItem(index)}>✕</Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div style={{ marginTop: 8 }}>
          <Button variant="ghost" size="sm" onClick={onAdd}>{addLabel}</Button>
        </div>
      )}
    </Card>
  );
}
