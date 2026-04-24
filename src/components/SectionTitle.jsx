import { useTheme } from "../context/ThemeContext";

// tone: "default" (accent) | "danger" | "warning" | "info"
export default function SectionTitle({ children, tone = "default" }) {
  const { $ } = useTheme();
  const color =
    tone === "warning" ? $.wr :
    tone === "danger"  ? $.dn :
    tone === "info"    ? $.in : $.ac;
  return (
    <div style={{ fontSize: 13, fontWeight: 700 }}>
      <span style={{ color }}>●</span> {children}
    </div>
  );
}
