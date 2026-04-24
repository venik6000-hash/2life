import { useTheme } from "../context/ThemeContext";

// A horizontal progress bar for 0-100% values with automatic tone.
// inverted=false (default): high value is good (accent) → warning → danger
// inverted=true: high value is bad (danger) → warning → accent
export default function PercentBar({ value, inverted = false }) {
  const { $ } = useTheme();
  const pct = Number.isFinite(+value) ? Math.max(0, Math.min(100, +value)) : null;

  let color;
  if (pct == null) {
    color = $.txM;
  } else if (inverted) {
    color = pct >= 70 ? $.dn : pct >= 40 ? $.wr : $.ac;
  } else {
    color = pct >= 70 ? $.ac : pct >= 40 ? $.wr : $.dn;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 9, background: $.bgI, borderRadius: 999, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct ?? 0}%`,
          background: color,
          borderRadius: 999,
          transition: "width .5s",
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 44, textAlign: "right" }}>
        {pct == null ? "—" : `${pct}%`}
      </span>
    </div>
  );
}
