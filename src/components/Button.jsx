import { useTheme } from "../context/ThemeContext";

const TONES = {
  default: { key: "ac",  dimKey: "acD" },
  accent:  { key: "ac",  dimKey: "acD" },
  danger:  { key: "dn",  dimKey: "dnD" },
  info:    { key: "in",  dimKey: "inD" },
  warning: { key: "wr",  dimKey: "wrD" },
  neutral: { key: "txS", dimKey: "bgI" },
};

const SIZES = {
  xs:   { padding: "2px 6px",   fontSize: 11, borderRadius: 5 },
  sm:   { padding: "4px 10px",  fontSize: 11, borderRadius: 6 },
  md:   { padding: "7px 14px",  fontSize: 12, borderRadius: 7 },
  lg:   { padding: "10px 16px", fontSize: 13, borderRadius: 8 },
  icon: { padding: "5px 9px",   fontSize: 15, borderRadius: 7 },
};

// variant: "solid" | "ghost" | "soft" | "pill" | "bare"
// tone:    "default" | "accent" | "danger" | "info" | "warning" | "neutral"
// size:    "xs" | "sm" | "md" | "lg" | "icon"
export default function Button({
  variant = "solid",
  tone = "default",
  size = "md",
  active = false,
  fullWidth = false,
  disabled = false,
  type = "button",
  onClick,
  title,
  children,
}) {
  const { $ } = useTheme();
  const tc = TONES[tone] || TONES.default;
  const sz = SIZES[size] || SIZES.md;
  const toneColor = $[tc.key];
  const dimColor = $[tc.dimKey];
  const isNeutral = tone === "default" || tone === "neutral";
  const borderRadius = variant === "pill" ? 999 : sz.borderRadius;

  let bg, fg, border;
  if (variant === "ghost") {
    bg = "transparent";
    fg = isNeutral ? $.txS : toneColor;
    border = `1px solid ${isNeutral ? $.brd : toneColor}`;
  } else if (variant === "soft") {
    bg = dimColor;
    fg = toneColor;
    border = "none";
  } else if (variant === "pill") {
    bg = active ? `${toneColor}22` : $.bgI;
    fg = active ? toneColor : $.txS;
    border = `1px solid ${active ? toneColor : $.brd}`;
  } else if (variant === "bare") {
    bg = "none";
    fg = isNeutral ? $.txS : toneColor;
    border = "none";
  } else {
    // solid
    bg = toneColor;
    fg = "#fff";
    border = "none";
  }

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...sz,
        borderRadius,
        background: bg,
        color: fg,
        border,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600,
        fontFamily: "inherit",
        transition: "all .15s",
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        whiteSpace: "nowrap",
        lineHeight: "inherit",
      }}
    >
      {children}
    </button>
  );
}
