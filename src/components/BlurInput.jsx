import { useTheme } from "../context/ThemeContext";

// Compact uncontrolled input that fires onSave on blur/Enter.
// Used in analytics tables where many cells need blur-save behaviour.
// tone: "default" | "accent" | "danger" | "warning" — sets text color
// bold: boolean — sets fontWeight 700
// align: "center" | "left" | "right"
export default function BlurInput({
  val,
  onSave,
  tone = "default",
  bold = false,
  align = "center",
}) {
  const { $ } = useTheme();
  const color =
    tone === "accent"  ? $.ac :
    tone === "danger"  ? $.dn :
    tone === "warning" ? $.wr :
    tone === "info"    ? $.in : $.tx;

  return (
    <input
      defaultValue={val}
      onBlur={e => onSave(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
      style={{
        padding: "4px 6px",
        borderRadius: 4,
        border: `1px solid ${$.brd}`,
        background: $.bgI,
        color,
        fontSize: 12,
        fontFamily: "inherit",
        outline: "none",
        width: "100%",
        textAlign: align,
        fontWeight: bold ? 700 : undefined,
        boxSizing: "border-box",
      }}
    />
  );
}
