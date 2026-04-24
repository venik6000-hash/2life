import { useTheme } from "../context/ThemeContext";

export default function TextArea({
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  rows = 2,
  resize = "vertical",
  minHeight,
  maxHeight,
  lineHeight,
  inputRef,
}) {
  const { $ } = useTheme();
  return (
    <textarea
      ref={inputRef}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={rows}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: `1px solid ${$.brd}`,
        background: $.bgI,
        color: $.tx,
        fontSize: 13,
        fontFamily: "inherit",
        outline: "none",
        width: "100%",
        resize,
        minHeight,
        maxHeight,
        lineHeight,
        boxSizing: "border-box",
      }}
    />
  );
}
