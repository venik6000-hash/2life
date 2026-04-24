import { useTheme } from "../context/ThemeContext";

// size: "md" (default, 13px) | "sm" (compact, 12px)
export default function Input({
  value,
  defaultValue,
  onChange,
  onKeyDown,
  onBlur,
  onFocus,
  placeholder,
  type = "text",
  autoComplete,
  autoFocus,
  readOnly,
  list,
  id,
  name,
  min,
  max,
  step,
  tabIndex,
  size = "md",
  inputRef,
  "aria-hidden": ariaHidden,
}) {
  const { $ } = useTheme();
  const isCompact = size === "sm";
  return (
    <input
      ref={inputRef}
      type={type}
      id={id}
      name={name}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onFocus={onFocus}
      placeholder={placeholder}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      readOnly={readOnly}
      list={list}
      min={min}
      max={max}
      step={step}
      tabIndex={tabIndex}
      aria-hidden={ariaHidden}
      style={{
        padding: isCompact ? "5px 8px" : "6px 10px",
        borderRadius: 6,
        border: `1px solid ${$.brd}`,
        background: $.bgI,
        color: $.tx,
        fontSize: isCompact ? 12 : 13,
        fontFamily: "inherit",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
      }}
    />
  );
}
