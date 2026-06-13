import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

const MONTHS = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];
const DAY_NAMES = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

const parseDate = (str) => {
  if (!str) return null;
  const parts = String(str).split(".");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y || y < 1900) return null;
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return null;
  return date;
};

const formatDate = (date) =>
  `${String(date.getDate()).padStart(2,"0")}.${String(date.getMonth()+1).padStart(2,"0")}.${date.getFullYear()}`;

const buildWeeks = (year, month) => {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const cur = new Date(year, month, 1 - startOffset);
  const weeks = [];
  while (weeks.length < 6) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (weeks.length >= 4 && week[6].getMonth() !== month) break;
  }
  return weeks;
};

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export default function MiniDatePicker({
  value = "",
  onChange,
  readOnly = false,
  emptyLabel = "дд.мм.гггг",
}) {
  const { $ } = useTheme();
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const [viewMonth, setViewMonth] = useState(() => {
    const today = new Date();
    return { y: today.getFullYear(), m: today.getMonth() };
  });
  const btnRef = useRef(null);
  const popupRef = useRef(null);

  const today = new Date();
  const todayKey = dayKey(today);
  const selected = parseDate(value);
  const selectedKey = selected ? dayKey(selected) : null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Reposition if window scrolls while open
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const updatePosition = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const POPUP_WIDTH = 230;
    const POPUP_HEIGHT = 310;
    let left = rect.left;
    let top  = rect.bottom + 4;
    if (left + POPUP_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - POPUP_WIDTH - 8;
    }
    if (top + POPUP_HEIGHT > window.innerHeight - 8) {
      top = rect.top - POPUP_HEIGHT - 4;
    }
    setPopupPos({ top, left });
  };

  const handleOpen = () => {
    if (open) { setOpen(false); return; }
    const sel = parseDate(value);
    setViewMonth(sel
      ? { y: sel.getFullYear(), m: sel.getMonth() }
      : { y: today.getFullYear(), m: today.getMonth() }
    );
    updatePosition();
    setOpen(true);
  };

  const changeMonth = (delta) => {
    setViewMonth(prev => {
      let m = prev.m + delta;
      let y = prev.y;
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      return { y, m };
    });
  };

  const selectDay = (date) => {
    onChange(formatDate(date));
    setOpen(false);
  };

  if (readOnly) {
    return (
      <span style={{ fontSize: 12, color: value ? "inherit" : $.txM }}>
        {value || emptyLabel}
      </span>
    );
  }

  const weeks = buildWeeks(viewMonth.y, viewMonth.m);

  const popup = open && createPortal(
    <div
      ref={popupRef}
      style={{
        position: "fixed",
        top: popupPos.top,
        left: popupPos.left,
        zIndex: 9999,
        background: $.bgC,
        border: `1px solid ${$.brd}`,
        borderRadius: 10,
        boxShadow: "0 6px 24px rgba(0,0,0,0.16)",
        padding: 12,
        width: 230,
      }}
    >
      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
        <button onClick={() => changeMonth(-1)} style={navBtnStyle($)}>‹</button>
        <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 700, color: $.tx }}>
          {MONTHS[viewMonth.m]} {viewMonth.y}
        </span>
        <button onClick={() => changeMonth(1)} style={navBtnStyle($)}>›</button>
      </div>

      {/* Day names */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 3 }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: $.txM, padding: "2px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Days */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {weeks.flat().map((date, i) => {
          const key = dayKey(date);
          const isCurMonth = date.getMonth() === viewMonth.m;
          const isToday    = key === todayKey;
          const isSel      = key === selectedKey;
          return (
            <button
              key={`${key}-${i}`}
              onClick={() => selectDay(date)}
              style={{
                padding: "5px 2px",
                borderRadius: 5,
                border: isToday && !isSel ? `1px solid ${$.ac}` : "1px solid transparent",
                background: isSel ? $.ac : "transparent",
                color: isSel ? "#fff" : isCurMonth ? $.tx : $.txM,
                fontSize: 11,
                fontFamily: "inherit",
                cursor: "pointer",
                fontWeight: isToday || isSel ? 700 : 400,
                opacity: isCurMonth ? 1 : 0.3,
                transition: "background .1s",
              }}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", gap: 6, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${$.brd}` }}>
        <button onClick={() => { onChange(""); setOpen(false); }} style={footerBtnStyle($, false)}>
          Очистить
        </button>
        <button onClick={() => selectDay(today)} style={footerBtnStyle($, true)}>
          Сегодня
        </button>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          background: "none",
          border: `1px dashed ${$.brd}`,
          borderRadius: 5,
          padding: "3px 8px",
          cursor: "pointer",
          fontSize: 12,
          color: value ? $.tx : $.txM,
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {value || emptyLabel}
      </button>
      {popup}
    </>
  );
}

const navBtnStyle = ($) => ({
  background: "none",
  border: `1px solid ${$.brd}`,
  borderRadius: 5,
  width: 26,
  height: 26,
  cursor: "pointer",
  fontSize: 16,
  color: $.tx,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "inherit",
  flexShrink: 0,
});

const footerBtnStyle = ($, accent) => ({
  flex: 1,
  background: "none",
  border: `1px solid ${accent ? $.ac : $.brd}`,
  borderRadius: 5,
  padding: "4px 6px",
  fontSize: 11,
  color: accent ? $.ac : $.txS,
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: accent ? 600 : 400,
});
