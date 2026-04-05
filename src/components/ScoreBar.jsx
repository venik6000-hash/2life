import { useTheme } from "../context/ThemeContext";

export default function ScoreBar({ s, mx = 10, invert = false }) {
  const { $ } = useTheme();
  const c = invert
    ? (s <= 3 ? $.ac : s <= 6 ? $.wr : $.dn)
    : (s <= 3 ? $.dn : s <= 6 ? $.wr : $.ac);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: $.bgI, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(s / mx) * 100}%`, background: c, borderRadius: 3, transition: "width .6s" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: c, minWidth: 20 }}>{s}</span>
    </div>
  );
}
