import { useEffect } from "react";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

export default function MobileBookmarksScreen({ chatId, onBack, onJumpToMessage }) {
  const { $ } = useTheme();
  const { pinnedForMe, loadPinnedForMe, unpinForMe } = useMessenger();
  const list = pinnedForMe[chatId] || [];

  useEffect(() => { loadPinnedForMe(chatId); }, [chatId, loadPinnedForMe]);

  return (
    <main style={{ minHeight: "100dvh", background: $.bg, color: $.tx, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px", borderBottom: `1px solid ${$.brd}`, display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" onClick={onBack} style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 22 }}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Закладки</div>
      </header>
      <section style={{ padding: 12, display: "grid", gap: 8 }}>
        {list.length === 0 && <div style={{ color: $.txS, fontSize: 13, textAlign: "center", padding: 30 }}>Закладок нет</div>}
        {list.map((m) => (
          <div key={m.id} style={{ padding: 12, background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 10, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: $.txS, fontWeight: 600 }}>{m.sender_display_name || m.sender_username}</div>
              <div style={{ fontSize: 13, color: $.tx, marginTop: 4, lineHeight: 1.4 }}>
                {m.deleted_for_all ? <em style={{ color: $.txS }}>Сообщение удалено</em> : m.text || "[файл]"}
              </div>
            </div>
            <button type="button" onClick={() => onJumpToMessage?.(m.id)} style={{ height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer", fontSize: 12 }}>Перейти</button>
            <button type="button" onClick={() => unpinForMe(chatId, m.id)} style={{ height: 32, padding: "0 10px", borderRadius: 8, border: "none", background: "transparent", color: $.txS, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        ))}
      </section>
    </main>
  );
}
