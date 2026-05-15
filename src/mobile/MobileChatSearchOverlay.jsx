import { useEffect, useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

export default function MobileChatSearchOverlay({ chatId, onClose, onJumpToMessage }) {
  const { $ } = useTheme();
  const { searchInChat } = useMessenger();
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setMatches([]); return; }
      const r = await searchInChat(chatId, q.trim());
      if (!cancelled) {
        setMatches(r.matches || []);
        setIndex(0);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, chatId, searchInChat]);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px",
      background: $.bgC, borderBottom: `1px solid ${$.brd}`,
      display: "flex", gap: 8, alignItems: "center", zIndex: 9990,
    }}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск в чате..."
             style={{ flex: 1, minWidth: 0, height: 40, padding: "0 12px", borderRadius: 10, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, fontSize: 16 }} />
      <div style={{ fontSize: 12, color: $.txS, minWidth: 50, textAlign: "center" }}>{matches.length > 0 ? `${index + 1}/${matches.length}` : "—"}</div>
      <button type="button" disabled={matches.length === 0}
              onClick={() => { const i = (index - 1 + matches.length) % matches.length; setIndex(i); onJumpToMessage?.(matches[i].messageId); }}
              style={{ width: 36, height: 36, border: "none", background: "transparent", color: $.tx, fontSize: 18 }}>↑</button>
      <button type="button" disabled={matches.length === 0}
              onClick={() => { const i = (index + 1) % matches.length; setIndex(i); onJumpToMessage?.(matches[i].messageId); }}
              style={{ width: 36, height: 36, border: "none", background: "transparent", color: $.tx, fontSize: 18 }}>↓</button>
      <button type="button" onClick={onClose}
              style={{ width: 36, height: 36, border: "none", background: "transparent", color: $.tx, fontSize: 18 }}>✕</button>
    </div>
  );
}
