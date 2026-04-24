import { useTheme } from "../context/ThemeContext";

export default function SidebarLogoToggle({ expanded, onToggle }) {
  const { $ } = useTheme();

  return (
    <div
      style={{
        padding: expanded ? "14px 16px" : "14px 8px",
        borderBottom: `1px solid ${$.brd}`,
        display: "flex",
        alignItems: "center",
        justifyContent: expanded ? "space-between" : "center",
      }}
    >
      {expanded && <span style={{ fontWeight: 800, fontSize: 17, color: $.ac }}>2life</span>}
      <button
        type="button"
        onClick={onToggle}
        style={{ background: "none", border: "none", color: $.txS, cursor: "pointer", fontSize: 16 }}
      >
        {expanded ? "◀" : "▶"}
      </button>
    </div>
  );
}
