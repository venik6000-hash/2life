import { useTheme } from "../context/ThemeContext";

const PADDING = { none: 0, sm: "12px 16px", md: 14, lg: 18 };
const TONE_BORDER = { accent: "ac", info: "in", warning: "wr", danger: "dn" };

// size:    "none" | "sm" | "md" | "lg"  (controls internal padding)
// clip:    overflow:hidden for border-radius clipping on child tables
// scrollX: horizontal scrolling (for wide tables)
// onClick: makes card interactive (adds pointer cursor + transition)
// tone:    "default" | "accent" | "info" | "warning" | "danger" (border color)
export default function Card({ size = "lg", clip = false, scrollX = false, onClick, tone = "default", children }) {
  const { $ } = useTheme();
  const borderColor = TONE_BORDER[tone] ? $[TONE_BORDER[tone]] : $.brd;
  return (
    <div
      onClick={onClick}
      style={{
        background: $.bgC,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: PADDING[size] ?? PADDING.lg,
        overflowX: scrollX ? "auto" : undefined,
        overflow: clip ? "hidden" : undefined,
        cursor: onClick ? "pointer" : undefined,
        transition: onClick ? "border-color .15s" : undefined,
      }}
    >
      {children}
    </div>
  );
}
