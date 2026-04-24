import { useTheme } from "../context/ThemeContext";
import SidebarNavItem from "./SidebarNavItem";

export default function SidebarFooter({
  expanded,
  username,
  isAdmin,
  adminActive,
  loggingOut,
  onOpenAdmin,
  onLogout,
}) {
  const { $ } = useTheme();

  return (
    <div
      style={{
        borderTop: `1px solid ${$.brd}`,
        padding: expanded ? "8px 14px" : "8px 6px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {expanded && (
        <div style={{ padding: "0 10px 4px", fontSize: 11, color: $.txM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {username || "Пользователь"}
        </div>
      )}
      {isAdmin && (
        <SidebarNavItem
          icon="⚙️"
          label="Admin"
          active={adminActive}
          onClick={onOpenAdmin}
          tone="muted"
          collapsed={!expanded}
        />
      )}
      <SidebarNavItem
        icon="↩"
        label={loggingOut ? "Выход..." : "Выйти"}
        active={false}
        onClick={onLogout}
        tone="danger"
        collapsed={!expanded}
      />
    </div>
  );
}
