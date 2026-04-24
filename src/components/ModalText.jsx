import { useTheme } from "../context/ThemeContext";

export function ModalTitle({ children }) {
  return <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>{children}</h3>;
}

export function ModalDescription({ children }) {
  const { $ } = useTheme();
  return <div style={{ fontSize: 12, color: $.txS, marginBottom: 10, lineHeight: 1.6 }}>{children}</div>;
}

export function ModalInfoBlock({ children, mono = false }) {
  const { $ } = useTheme();
  return (
    <div style={{ background: $.bgI, borderRadius: 7, padding: mono ? 14 : 10, margin: "12px 0", fontSize: 12, fontFamily: mono ? "monospace" : undefined }}>
      {children}
    </div>
  );
}

export function ModalCodeLabel({ children, offset = false }) {
  const { $ } = useTheme();
  return <div style={{ color: $.ac, marginTop: offset ? 6 : 0 }}>{children}</div>;
}
