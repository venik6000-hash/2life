import { useTheme } from "../context/ThemeContext";
import Ed from "./Ed";

// Standard "Комментарии" block used at the bottom of questionnaire cards.
export default function QCommentBlock({ value, fieldKey, onSave, readOnly = false }) {
  const { $ } = useTheme();
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: $.wr }}>Комментарии</div>
      <div style={{ padding: "10px 12px", borderRadius: 10, background: $.bgI, fontSize: 12, lineHeight: 1.55 }}>
        <Ed
          value={String(value ?? "")}
          editKey={fieldKey}
          multiline
          onSave={onSave}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
