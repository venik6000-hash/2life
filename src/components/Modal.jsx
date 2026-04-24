import { useTheme } from "../context/ThemeContext";

const MAX_WIDTH = { sm: 420, md: 540, lg: 640 };

export default function Modal({ onClose, size = "md", children }) {
  const { $ } = useTheme();
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        backdropFilter: "blur(3px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: $.bgC,
          border: `1px solid ${$.brd}`,
          borderRadius: 14,
          padding: 28,
          maxWidth: MAX_WIDTH[size] ?? MAX_WIDTH.md,
          width: "92%",
          maxHeight: "82vh",
          overflow: "auto",
          boxShadow: $.sh,
        }}
      >
        {children}
      </div>
    </div>
  );
}
