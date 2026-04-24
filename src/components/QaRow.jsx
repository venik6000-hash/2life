import { useTheme } from "../context/ThemeContext";
import Ed from "./Ed";

// A questionnaire field row: left label + right editable value.
// sub=true renders as a sub-row with indent and muted label color.
export default function QaRow({ label, fieldKey, value, onSave, sub = false, labelWidth = "145px", readOnly = false }) {
  const { $ } = useTheme();
  return (
    <div style={{
      padding: sub ? "4px 0 4px 12px" : "6px 0",
      borderBottom: `1px solid ${$.brd}`,
      fontSize: 12,
      lineHeight: 1.45,
      display: "flex",
      gap: 10,
      alignItems: "flex-start",
    }}>
      <span style={{ color: sub ? $.txM : $.txS, fontSize: 12, flex: `0 0 ${labelWidth}`, maxWidth: "45%" }}>
        {label}
      </span>
      <span style={{ fontSize: 12, lineHeight: 1.45, flex: 1, minWidth: 0 }}>
        <Ed
          value={String(value ?? "")}
          editKey={fieldKey}
          onSave={onSave}
          size="sm"
          readOnly={readOnly}
        />
      </span>
    </div>
  );
}
