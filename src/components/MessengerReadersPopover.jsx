import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { formatReadAt } from "../utils/formatReadAt";

export default function MessengerReadersPopover({
  chatId, messageId, variant = "popover", onClose, anchorRect,
}) {
  const { $ } = useTheme();
  const { authFetch } = useAuth();
  const [state, setState] = useState({ status: "loading", readers: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(`/api/chats/${chatId}/messages/${messageId}/readers`);
        const data = await res.json();
        if (!alive) return;
        if (res.ok) setState({ status: "ok", readers: data.readers || [] });
        else setState({ status: "error", readers: [], error: data?.error });
      } catch (e) {
        if (alive) setState({ status: "error", readers: [], error: e.message });
      }
    })();
    return () => { alive = false; };
  }, [authFetch, chatId, messageId]);

  const wrapperStyle = variant === "sheet"
    ? {
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 10000,
        background: $.bgC, borderTop: `1px solid ${$.brd}`,
        borderRadius: "16px 16px 0 0", padding: 12, maxHeight: "60vh", overflowY: "auto",
      }
    : {
        position: "fixed",
        top: Math.min((anchorRect?.top ?? 0), window.innerHeight - 360),
        left: Math.min((anchorRect?.right ?? 0) + 6, window.innerWidth - 280),
        width: 260, zIndex: 10000,
        background: $.bgC, border: `1px solid ${$.brd}`,
        borderRadius: 10, boxShadow: $.sh, padding: 8, maxHeight: 340, overflowY: "auto",
      };

  return (
    <div style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
      {state.status === "loading" && <div style={{ padding: 8, color: $.txM, fontSize: 13 }}>Загрузка…</div>}
      {state.status === "error" && <div style={{ padding: 8, color: $.dn, fontSize: 13 }}>Не удалось загрузить</div>}
      {state.status === "ok" && state.readers.length === 0 && <div style={{ padding: 8, color: $.txM, fontSize: 13 }}>Никто ещё не прочитал</div>}
      {state.status === "ok" && state.readers.map((r) => (
        <div key={r.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px" }}>
          <Avatar src={r.avatar} name={r.name} bg={$.acD} fg={$.ac} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: $.tx, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
            <div style={{ color: $.txM, fontSize: 11 }}>✓✓ {formatReadAt(r.readAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Avatar({ src, name, bg, fg }) {
  if (src) return <img src={src} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />;
  const initials = String(name || "?").split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>
      {initials || "?"}
    </div>
  );
}
