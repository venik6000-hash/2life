import { useTheme } from "../context/ThemeContext";

const parseStressPercents = (raw) => {
  const s = String(raw || "");
  const out = [];
  const matches = s.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g);
  for (const m of matches) {
    const n = +String(m[1]).replace(",", ".");
    if (Number.isFinite(n)) out.push(Math.max(0, Math.min(100, n)));
  }
  return out;
};

const stressTone = (v) => (v >= 70 ? "dn" : v >= 40 ? "wr" : "ac");
const stressLabel = (v) => (v >= 70 ? "Высокий" : v >= 40 ? "Средний" : "Низкий");

export default function StressScale({ value }) {
  const { $ } = useTheme();
  const pct = parseStressPercents(value);
  if (!pct.length) return null;
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 180, justifyItems: "end" }}>
      {pct.map((p, i) => {
        const tone = stressTone(p);
        return (
          <div key={`${p}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", maxWidth: 240 }}>
            <div style={{ flex: 1, height: 8, background: $.bgI, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p}%`, background: $[tone], borderRadius: 999 }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: $[tone], minWidth: 36, textAlign: "right" }}>{p}%</span>
            <span style={{ fontSize: 11, color: $.txS, minWidth: 58, textAlign: "right" }}>{stressLabel(p)}</span>
          </div>
        );
      })}
    </div>
  );
}
