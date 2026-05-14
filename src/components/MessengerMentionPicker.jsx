import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";

export default function MessengerMentionPicker({ participants, query, onPick, currentUserId }) {
  const { $ } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const q = String(query || "").toLowerCase().trim();
    return (participants || [])
      .filter((p) => p.user_id !== currentUserId)
      .filter((p) => {
        if (!q) return true;
        return (
          String(p.display_name || "").toLowerCase().includes(q) ||
          String(p.username || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [participants, query, currentUserId]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    const onKey = (e) => {
      if (filtered.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => (i + 1) % filtered.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length); }
      else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        onPick?.(filtered[activeIndex]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, activeIndex, onPick]);

  if (filtered.length === 0) return null;

  return (
    <div ref={listRef} style={{
      position: "absolute", bottom: "calc(100% + 4px)", left: 0,
      background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 10,
      boxShadow: $.sh, padding: 4, minWidth: 200, maxHeight: 260, overflowY: "auto", zIndex: 50,
    }}>
      {filtered.map((p, idx) => (
        <button
          key={p.user_id}
          type="button"
          onMouseEnter={() => setActiveIndex(idx)}
          onClick={() => onPick?.(p)}
          style={{
            width: "100%", textAlign: "left", padding: "8px 10px",
            background: idx === activeIndex ? $.bg : "transparent",
            color: $.tx, border: "none", borderRadius: 6, cursor: "pointer",
            fontSize: 13, fontFamily: "inherit",
          }}
        >
          {p.display_name || p.username}
          {p.display_name && <span style={{ color: $.txS, marginLeft: 6 }}>@{p.username}</span>}
        </button>
      ))}
    </div>
  );
}
