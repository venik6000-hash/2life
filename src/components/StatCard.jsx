import { useTheme } from "../context/ThemeContext";
import Card from "./Card";

const TONES = {
  accent: "ac",
  danger: "dn",
  warning: "wr",
  info: "in",
  purple: "pu",
};

export default function StatCard({
  label,
  value,
  description,
  tone = "accent",
  onClick,
}) {
  const { $ } = useTheme();
  const colorKey = TONES[tone] || TONES.accent;

  return (
    <Card size="md" onClick={onClick} tone={onClick ? "info" : "default"}>
      <div style={{ fontSize: 10, color: $.txM, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: $[colorKey], letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 11, color: $.txS }}>{description}</div>
    </Card>
  );
}
