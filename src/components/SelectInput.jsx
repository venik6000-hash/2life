import { useTheme } from "../context/ThemeContext";

// size: "md" (default) | "sm" | "xs"
export default function SelectInput({
  value,
  onChange,
  onBlur,
  disabled,
  size = "md",
  children,
  inputRef,
}) {
  const { $ } = useTheme();
  const isCompact = size === "sm" || size === "xs";
  return (
    <select
      ref={inputRef}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      style={{
        padding: size === "xs" ? "2px 6px" : isCompact ? "4px 8px" : "6px 10px",
        borderRadius: 6,
        border: `1px solid ${$.brd}`,
        background: $.bgI,
        color: $.tx,
        fontSize: isCompact ? 12 : 13,
        fontFamily: "inherit",
        outline: "none",
        width: "100%",
        cursor: "pointer",
        boxSizing: "border-box",
      }}
    >
      {children}
    </select>
  );
}
