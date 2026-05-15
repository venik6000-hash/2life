import { useEffect, useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

export default function MobileSearchScreen({ onBack, onSelectChat }) {
  const { $ } = useTheme();
  const { searchGlobal } = useMessenger();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setGroups([]); return; }
      setBusy(true);
      const r = await searchGlobal(q.trim());
      if (!cancelled) {
        setGroups(r.groups || []);
        setBusy(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, searchGlobal]);

  return (
    <main style={{ minHeight: "100dvh", background: $.bg, color: $.tx, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px", borderBottom: `1px solid ${$.brd}`, display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={onBack} style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 22 }}>‹</button>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по всем чатам..."
               style={{ flex: 1, height: 40, padding: "0 12px", borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 14 }} />
      </header>
      <section style={{ padding: 12, display: "grid", gap: 12 }}>
        {busy && <div style={{ color: $.txS, fontSize: 13 }}>Поиск...</div>}
        {!busy && q.trim().length >= 2 && groups.length === 0 && (
          <div style={{ color: $.txS, fontSize: 13, textAlign: "center", padding: 20 }}>Ничего не найдено</div>
        )}
        {groups.map((g) => (
          <div key={g.chatId}>
            <div style={{ fontSize: 11, fontWeight: 700, color: $.txS, marginBottom: 6 }}>{g.chatTitle}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {g.matches.map((m) => (
                <button key={m.messageId} type="button"
                  onClick={() => onSelectChat?.(g.chatId, m.messageId)}
                  style={{ textAlign: "left", padding: 10, background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 10, color: $.tx, fontSize: 13, cursor: "pointer" }}>
                  {m.snippet}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
