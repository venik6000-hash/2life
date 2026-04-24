import { useTheme } from "../context/ThemeContext";
import Wrapper from "./Wrapper";

export default function FormField({
  label,
  hint,
  error,
  children,
  footer,
}) {
  const { $ } = useTheme();

  return (
    <Wrapper gap="xs">
      {label && (
        <label
          style={{
            fontSize: 11,
            color: $.txS,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {label}
        </label>
      )}
      {children}
      {hint && !error && (
        <div
          style={{
            fontSize: 11,
            color: $.txM,
            lineHeight: 1.45,
          }}
        >
          {hint}
        </div>
      )}
      {error && (
        <div
          style={{
            fontSize: 11,
            color: $.dn,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      )}
      {footer}
    </Wrapper>
  );
}
