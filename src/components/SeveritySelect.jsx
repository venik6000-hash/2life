import { useTheme } from "../context/ThemeContext";
import { sevColors, sevLabels } from "../styles/theme";

export default function SeveritySelect({ value, onChange }) {
  const { $ } = useTheme();
  const colorKey = sevColors[value] || "wr";

  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        padding: "2px 6px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 600,
        border: `1px solid ${$.brd}`,
        background: $.bgI,
        color: $[colorKey],
        cursor: "pointer",
        fontFamily: "inherit",
        outline: "none",
      }}
    >
      {Object.entries(sevLabels).map(([severity, label]) => (
        <option key={severity} value={severity}>{label}</option>
      ))}
    </select>
  );
}
