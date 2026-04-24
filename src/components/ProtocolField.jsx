import { useTheme } from "../context/ThemeContext";
import Ed from "./Ed";

// Renders an editable field (via Ed) when editable=true, or a read-only styled div otherwise.
export default function ProtocolField({ value, editKey, onSave, multiline = false, editable, save, ml }) {
  const { $ } = useTheme();
  if (editable) {
    return (
      <Ed
        value={value == null ? "" : String(value)}
        editKey={editKey}
        onSave={onSave ?? save}
        multiline={multiline || !!ml}
      />
    );
  }
  return (
    <div style={{ color: value ? $.tx : $.txM, fontStyle: value ? "normal" : "italic" }}>
      {value || "—"}
    </div>
  );
}
