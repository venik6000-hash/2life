import { useTheme } from "../context/ThemeContext";

export default function Badge({ c, ch }) {
  const { $ } = useTheme();
  return (
    <span style={{
      display: "inline-flex", padding: "2px 9px", borderRadius: 5,
      fontSize: 11, fontWeight: 600,
      background: $[c + "D"] || $.acD, color: $[c] || $.ac,
      whiteSpace: "nowrap"
    }}>{ch}</span>
  );
}
