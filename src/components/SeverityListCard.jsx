import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import Button from "./Button";
import Ed from "./Ed";
import SeverityBadge from "./SeverityBadge";
import SeveritySelect from "./SeveritySelect";

export default function SeverityListCard({
  title,
  items,
  readOnly = false,
  onAdd,
  onDelete,
  onSaveName,
  onChangeSeverity,
  addLabel,
}) {
  const { $ } = useTheme();

  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {(items || []).map((item, index) => (
        <div
          key={`${item.name || "syndrome"}-${index}`}
          style={{
            padding: "5px 0",
            borderBottom: `1px solid ${$.brd}`,
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ flex: 1 }}>
            <Ed
              value={item.name}
              editKey={`severity-name-${index}`}
              onSave={value => onSaveName(index, value)}
              readOnly={readOnly}
            />
          </div>
          {readOnly ? (
            <SeverityBadge severity={item.severity} />
          ) : (
            <SeveritySelect value={item.severity} onChange={event => onChangeSeverity(index, event.target.value)} />
          )}
          {!readOnly && (
            <Button variant="bare" tone="danger" size="xs" onClick={() => onDelete(index)}>✕</Button>
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
