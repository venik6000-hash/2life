import { useTheme } from "../context/ThemeContext";
import ClientAvatar from "./ClientAvatar";

function SidebarClientMenuItem({ client, active, canRename, onSelect, onRename }) {
  const { $ } = useTheme();

  return (
    <div
      onClick={() => onSelect(client)}
      style={{
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        background: active ? $.acD : "transparent",
        borderBottom: `1px solid ${$.brd}`,
        fontSize: 12,
      }}
    >
      <ClientAvatar color={client.color} avatar={client.avatar} size="sm" />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {client.shortName || client.name}
      </span>
      {canRename && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onRename(client); }}
          title="Переименовать клиента"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: $.txM,
            fontSize: 12,
            padding: "2px 4px",
            lineHeight: 1,
          }}
        >
          ✎
        </button>
      )}
    </div>
  );
}

export default function SidebarClientPicker({
  expanded,
  client,
  city,
  open,
  clients,
  activeClientId,
  canRename,
  canCreate,
  onToggle,
  onSelectClient,
  onRenameClient,
  onCreateClient,
}) {
  const { $ } = useTheme();

  return (
    <div style={{ padding: expanded ? "10px 14px" : "10px 6px", borderBottom: `1px solid ${$.brd}` }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          padding: 7,
          borderRadius: 7,
          background: $.bgI,
        }}
      >
        <ClientAvatar color={client.color} avatar={client.avatar} />
        {expanded && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {client.shortName}
            </div>
            <div style={{ fontSize: 10, color: $.txM }}>{city || "—"}</div>
          </div>
        )}
      </div>

      {open && expanded && (
        <div style={{ marginTop: 6, background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 7, overflow: "hidden", boxShadow: $.sh }}>
          {clients.map((item) => (
            <SidebarClientMenuItem
              key={item.id}
              client={item}
              active={item.id === activeClientId}
              canRename={canRename}
              onSelect={onSelectClient}
              onRename={onRenameClient}
            />
          ))}
          {canCreate && (
            <div
              onClick={onCreateClient}
              style={{ padding: "8px 10px", cursor: "pointer", color: $.ac, fontSize: 12, fontWeight: 600 }}
            >
              + Новый клиент
            </div>
          )}
        </div>
      )}
    </div>
  );
}
