import { useTheme } from "../context/ThemeContext";

// A sidebar navigation item. Renders as a div (non-interactive semantically when used for nav).
// tone: "default" | "danger" | "muted"
// collapsed: sidebar is in icon-only mode
export default function SidebarNavItem({ icon, label, active, onClick, tone = "default", collapsed }) {
  const { $ } = useTheme();
  const fg =
    tone === "danger" ? $.dn :
    tone === "muted"  ? $.txM :
    active            ? $.ac   : $.txS;

  return (
    <div
      onClick={onClick}
      style={{
        padding: collapsed ? "9px 4px" : "9px 10px",
        borderRadius: 7,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        background: active ? $.acD : "transparent",
        color: fg,
        fontWeight: active ? 600 : 400,
        justifyContent: collapsed ? "center" : "flex-start",
        transition: "background .15s",
      }}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      {!collapsed && label}
    </div>
  );
}
