import { useRef, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { useEditor } from "../context/EditorContext";

export default function SexEd({ value, f, options, save }) {
  const { $ } = useTheme();
  const { ef, setEf } = useEditor();
  const selectRef = useRef(null);

  const inp = { padding: "6px 10px", borderRadius: 6, border: `1px solid ${$.brd}`, background: $.bgI, color: $.tx, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" };

  useEffect(() => {
    if (ef !== f || !selectRef.current) return;
    const node = selectRef.current;
    requestAnimationFrame(() => {
      try { node.focus({ preventScroll: true }); } catch (_) { node.focus(); }
      if (typeof node.showPicker === "function") {
        try { node.showPicker(); return; } catch (_) {}
      }
      try { node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window })); } catch (_) {}
      try { node.click(); } catch (_) {}
    });
  }, [ef, f]);

  if (ef === f) return (
    <select
      ref={selectRef}
      value={String(value || "")}
      onChange={e => { save(e.target.value); setEf(null); }}
      onBlur={() => setEf(null)}
      style={{ ...inp, width: "auto", minWidth: 140, padding: "4px 8px", fontSize: 12, textAlign: "left" }}
    >
      {!options.includes(String(value || "")) && <option value={String(value || "")}>{String(value || "") || "—"}</option>}
      {options.map(opt => <option key={opt || "empty"} value={opt}>{opt || "—"}</option>)}
    </select>
  );

  return (
    <span
      style={{ cursor: "pointer", borderBottom: `1px dashed ${$.brd}`, display: "inline-block", color: value ? $.tx : $.txM, fontStyle: value ? "normal" : "italic" }}
      onMouseDown={e => { e.preventDefault(); setEf(f); }}
      title="Редактировать"
    >
      {value || "—"}
    </span>
  );
}
